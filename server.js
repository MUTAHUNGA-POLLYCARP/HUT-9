// Force Google DNS to bypass local Windows/ISP SRV blocking
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'hut9_super_secret_jwt_key_123';
const APP_URL = process.env.APP_URL || 'https://hut-9.onrender.com';

const PESAPAL_BASE_URL = process.env.PESAPAL_ENV === 'live' 
  ? 'https://pay.pesapal.com/v3' 
  : 'https://cyb3r.pesapal.com/pesapalv3';

let cachedIpnId = process.env.PESAPAL_IPN_ID || null;

// ==========================================
// 1. MIDDLEWARE & SECURITY CONFIGURATION
// ==========================================
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Assets
app.use(express.static(path.join(__dirname)));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rate Limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { message: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { message: 'Too many login/registration attempts. Please wait 10 minutes.' }
});

app.use('/api/', globalLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// Optional JWT Guard Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || token === 'undefined' || token === 'null') {
    return next(); 
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err && user) {
      req.user = user;
    }
    next();
  });
};

// ==========================================
// 2. DATABASE CONNECTION & SCHEMAS
// ==========================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hut9';

mongoose.connect(MONGO_URI, { family: 4 })
  .then(() => console.log('✅ Connected to MongoDB Atlas / Local DB successfully!'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// MongoDB Withdrawal Schema
const withdrawalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phoneNumber: { type: String, required: true },
  network: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Completed', 'Rejected'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const Withdrawal = mongoose.models.Withdrawal || mongoose.model('Withdrawal', withdrawalSchema);

// MongoDB Transaction Record Schema (Prevents double crediting)
const transactionSchema = new mongoose.Schema({
  orderTrackingId: { type: String, required: true, unique: true },
  merchantReference: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number, required: true },
  status: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

// ==========================================
// 3. PESAPAL INTEGRATION UTILITIES
// ==========================================
async function getPesapalAuthToken() {
  try {
    const response = await axios.post(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
    });
    return response.data.token;
  } catch (error) {
    console.error('Pesapal Auth Error:', error.response ? error.response.data : error.message);
    throw new Error('Failed to authenticate with Pesapal.');
  }
}

async function getPesapalNotificationId(token) {
  if (cachedIpnId) return cachedIpnId;

  try {
    const response = await axios.post(
      `${PESAPAL_BASE_URL}/api/URLSetup/RegisterIPN`,
      {
        url: `${APP_URL}/api/pesapal/ipn`,
        ipn_notification_type: 'POST'
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (response.data && response.data.ipn_id) {
      cachedIpnId = response.data.ipn_id;
      console.log('✅ Registered Dynamic Pesapal IPN ID:', cachedIpnId);
      return cachedIpnId;
    }
    throw new Error('No IPN ID returned by Pesapal.');
  } catch (error) {
    console.warn('Pesapal IPN Registration note (checking existing IPNs):', error.response ? error.response.data : error.message);
    
    try {
      const listResponse = await axios.get(
        `${PESAPAL_BASE_URL}/api/URLSetup/GetRegisteredIPN`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (listResponse.data && Array.isArray(listResponse.data)) {
        const existing = listResponse.data.find(i => i.url && i.url.includes('/api/pesapal/ipn'));
        if (existing && existing.ipn_id) {
          cachedIpnId = existing.ipn_id;
          console.log('✅ Retrieved existing Pesapal IPN ID:', cachedIpnId);
          return cachedIpnId;
        }
      }
    } catch (listErr) {
      console.error('Failed to fetch existing IPNs:', listErr.message);
    }

    throw new Error('Failed to obtain Pesapal IPN Notification ID.');
  }
}

// Helper to Process and Credit User Wallet
async function creditUserDeposit(orderTrackingId, merchantReference, fallbackUserId) {
  try {
    const existingTx = await Transaction.findOne({ orderTrackingId });
    if (existingTx && existingTx.status === 'Completed') {
      console.log(`Transaction ${orderTrackingId} already credited.`);
      const existingUser = await User.findById(existingTx.userId);
      return { status: 'Completed', userId: existingTx.userId, balance: existingUser ? existingUser.balance : 0 };
    }

    const token = await getPesapalAuthToken();
    const statusRes = await axios.get(
      `${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const paymentData = statusRes.data;

    if (paymentData.payment_status_description === 'Completed' || paymentData.status_code === 1) {
      let targetUser = null;

      if (merchantReference) {
        const parts = merchantReference.split('_');
        const extractedId = parts[parts.length - 1]; // Robust extraction of userId

        if (extractedId && mongoose.Types.ObjectId.isValid(extractedId)) {
          targetUser = await User.findById(extractedId);
        }
      }

      if (!targetUser && fallbackUserId && mongoose.Types.ObjectId.isValid(fallbackUserId)) {
        targetUser = await User.findById(fallbackUserId);
      }

      if (targetUser) {
        const depositAmount = Number(paymentData.amount);
        targetUser.balance = (targetUser.balance || 0) + depositAmount;
        await targetUser.save();

        await Transaction.create({
          orderTrackingId,
          merchantReference: merchantReference || `HUT9_${Date.now()}_${targetUser._id}`,
          userId: targetUser._id,
          amount: depositAmount,
          status: 'Completed'
        });

        console.log(`✅ Successfully credited UGX ${depositAmount} to user ${targetUser.username}`);
        return { status: 'Completed', user: targetUser, balance: targetUser.balance };
      } else {
        console.warn(`⚠️ Payment received for order ${orderTrackingId}, but no matching user was found.`);
        return { status: 'User Not Found' };
      }
    }

    return { status: paymentData.payment_status_description || 'Pending' };
  } catch (error) {
    console.error('Error processing deposit crediting:', error.message);
    throw error;
  }
}

// ==========================================
// 4. AUTHENTICATION ENDPOINTS
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ success: false, message: 'Database connection error.' });
    }

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
      balance: 0,
      unlockedTiers: [],
      investments: []
    });

    await newUser.save();

    res.status(201).json({ 
      success: true,
      message: 'Account created successfully! You can now log in.',
      user: { id: newUser._id, username: newUser.username, email: newUser.email }
    });

  } catch (error) {
    console.error('Detailed Registration Error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration.', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({ success: false, message: 'Database connection error.' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both email and password.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, username: user.username, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful!',
      token: token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        balance: user.balance || 0,
        unlockedTiers: user.unlockedTiers || []
      }
    });

  } catch (error) {
    console.error('Detailed Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.', error: error.message });
  }
});

// ==========================================
// 5. WALLET & TRANSACTION ENDPOINTS
// ==========================================
app.get('/api/user-status/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      balance: user.balance || 0,
      unlockedTiers: user.unlockedTiers || []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user status.' });
  }
});

// Check Pesapal Payment Status
app.get('/api/pesapal/check-status', async (req, res) => {
  try {
    const { orderTrackingId, userId, merchantReference } = req.query;

    if (!orderTrackingId) {
      return res.status(400).json({ success: false, message: 'Order tracking ID is required.' });
    }

    const result = await creditUserDeposit(orderTrackingId, merchantReference, userId);

    if (result.status === 'Completed') {
      const user = await User.findById(userId || result.userId);
      return res.status(200).json({
        success: true,
        status: 'Completed',
        newBalance: user ? user.balance : result.balance,
        message: 'Payment completed and wallet updated successfully.'
      });
    }

    res.status(200).json({
      success: false,
      status: result.status,
      message: 'Payment pending or incomplete.'
    });

  } catch (error) {
    console.error('Check Status Error:', error.message);
    res.status(500).json({ success: false, message: 'Error checking payment status.' });
  }
});

// Pesapal Deposit Request
app.post('/api/deposit', async (req, res) => {
  try {
    const { userId, phoneNumber, amount } = req.body;

    if (!userId || !amount || Number(amount) < 500) {
      return res.status(400).json({ success: false, message: 'Minimum deposit is UGX 500.' });
    }

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Standardize Ugandan Mobile Money Number Format (256...)
    let formattedPhone = phoneNumber.toString().trim().replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '256' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('256')) {
      formattedPhone = '256' + formattedPhone;
    }

    const pesapalToken = await getPesapalAuthToken();
    const notificationId = await getPesapalNotificationId(pesapalToken);
    const merchantReference = `HUT9_${Date.now()}_${user._id.toString()}`;

    const payload = {
      id: merchantReference,
      currency: 'UGX',
      amount: Number(amount),
      description: `HUT 9 Wallet Deposit for ${user.username}`,
      callback_url: `${APP_URL}/dashboard.html?userId=${user._id}`,
      notification_id: notificationId,
      billing_address: {
        email_address: user.email || `${user.username.toLowerCase()}@hut9.com`,
        phone_number: formattedPhone,
        first_name: user.username,
        last_name: 'Member',
        country_code: 'UG'
      }
    };

    const response = await axios.post(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, payload, {
      headers: {
        Authorization: `Bearer ${pesapalToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.redirect_url) {
      return res.status(200).json({
        success: true,
        redirect_url: response.data.redirect_url,
        orderTrackingId: response.data.order_tracking_id,
        merchantReference: merchantReference,
        message: 'Redirecting to Pesapal Mobile Money payment portal...'
      });
    }

    res.status(400).json({ success: false, message: 'Failed to generate payment request.' });

  } catch (error) {
    console.error('Pesapal Deposit Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      success: false, 
      message: error.response?.data?.message || 'Error initiating Pesapal payment.' 
    });
  }
});

// Unified Pesapal IPN Webhook Listener
const handleIpnCallback = async (req, res) => {
  try {
    const OrderTrackingId = req.body.OrderTrackingId || req.query.OrderTrackingId || req.query.orderTrackingId;
    const OrderMerchantReference = req.body.OrderMerchantReference || req.query.OrderMerchantReference || req.query.orderMerchantReference;

    if (!OrderTrackingId) {
      return res.status(400).json({ success: false, message: 'Missing OrderTrackingId' });
    }

    await creditUserDeposit(OrderTrackingId, OrderMerchantReference, null);

    res.status(200).json({
      orderNotificationType: 'IPNCHANGE',
      orderTrackingId: OrderTrackingId,
      orderMerchantReference: OrderMerchantReference,
      status: 200
    });
  } catch (error) {
    console.error('Pesapal IPN Error:', error.message);
    res.status(500).send('IPN processing failed.');
  }
};

app.post('/api/pesapal/ipn', handleIpnCallback);
app.get('/api/pesapal/ipn', handleIpnCallback);

// Persistent Withdrawal Endpoint (UNTOUCHED)
app.post('/api/withdraw', authenticateToken, async (req, res) => {
  try {
    const { userId, phoneNumber, network, amount } = req.body;
    const targetUserId = userId || (req.user && req.user.userId);

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'User ID is required for withdrawal.' });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid withdrawal amount.' });
    }

    const user = await User.findById(targetUserId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    if ((user.balance || 0) < Number(amount)) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
    }

    user.balance = (user.balance || 0) - Number(amount);
    await user.save();

    const withdrawalRequest = new Withdrawal({
      userId: user._id,
      phoneNumber,
      network,
      amount: Number(amount)
    });
    await withdrawalRequest.save();

    res.status(200).json({
      success: true,
      message: `Withdrawal request for UGX ${Number(amount).toLocaleString()} submitted successfully!`,
      newBalance: user.balance
    });
  } catch (error) {
    console.error('Withdrawal Server Error:', error);
    res.status(500).json({ success: false, message: 'Server error during withdrawal processing.' });
  }
});

// ==========================================
// NEW: ADMIN WITHDRAWAL MANAGEMENT ENDPOINTS
// ==========================================

// Fetch all pending withdrawal requests for admin dashboard
app.get('/api/admin/withdrawals/pending', async (req, res) => {
  try {
    const pendingWithdrawals = await Withdrawal.find({ status: 'Pending' })
      .populate('userId', 'username email balance')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: pendingWithdrawals
    });
  } catch (error) {
    console.error('Admin Fetch Withdrawals Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending withdrawals.' });
  }
});

// Manually process (Approve or Reject) a withdrawal request
app.post('/api/admin/withdrawals/process', async (req, res) => {
  try {
    const { withdrawalId, action } = req.body;

    if (!withdrawalId || !['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Valid withdrawalId and action (APPROVE or REJECT) are required.' });
    }

    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found.' });
    }

    if (withdrawal.status !== 'Pending') {
      return res.status(400).json({ success: false, message: `Withdrawal has already been marked as ${withdrawal.status}.` });
    }

    if (action === 'APPROVE') {
      withdrawal.status = 'Completed';
      await withdrawal.save();

      return res.status(200).json({
        success: true,
        message: `Withdrawal for UGX ${withdrawal.amount.toLocaleString()} marked as APPROVED. You can now send funds manually via Mobile Money.`
      });
    }

    if (action === 'REJECT') {
      withdrawal.status = 'Rejected';
      await withdrawal.save();

      // Refund the deducted funds back to the user's account balance
      await User.findByIdAndUpdate(withdrawal.userId, {
        $inc: { balance: withdrawal.amount }
      });

      return res.status(200).json({
        success: true,
        message: `Withdrawal REJECTED. UGX ${withdrawal.amount.toLocaleString()} refunded back to user balance.`
      });
    }

  } catch (error) {
    console.error('Admin Process Withdrawal Error:', error);
    res.status(500).json({ success: false, message: 'Server error processing withdrawal.' });
  }
});

app.post('/api/subscribe', async (req, res) => {
  try {
    const { userId, tierId, price } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.balance < price) {
      return res.status(400).json({ success: false, message: 'Insufficient balance to subscribe to this tier.' });
    }

    user.balance -= Number(price);
    if (!user.unlockedTiers.includes(tierId)) {
      user.unlockedTiers.push(tierId);
    }

    await user.save();

    const dailyEarnings = Math.round((price * 0.40) / 30);

    res.status(200).json({
      success: true,
      message: 'Subscribed successfully!',
      newBalance: user.balance,
      earnings: { dailyEarnings }
    });
  } catch (error) {
    console.error('Subscription Error:', error);
    res.status(500).json({ success: false, message: 'Server error during subscription.' });
  }
});

// ==========================================
// 6. FALLBACK & ERROR HANDLERS
// ==========================================
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled System Error:', err.stack);
  res.status(500).json({ success: false, message: 'An internal server error occurred.', error: err.message });
});

// ==========================================
// 7. START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`HUT 9 Server actively listening on http://localhost:${PORT}`);
  console.log(`=================================`);
});