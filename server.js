require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();
// 1. Secure HTTP headers
app.use(cors());
app.use(helmet());

// 2. Global Rate Limiting (Limits requests per IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 mins
  message: { message: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', globalLimiter);

// 3. Strict Rate Limiter for Auth Routes (Prevents Brute-Force Logins)
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Maximum 5 attempts
  message: { message: 'Too many login/registration attempts. Please wait 10 minutes.' }
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// 4. JWT Authentication Guard Middleware for Private Routes
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No authentication token provided.' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'hut9_secret_key_123', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

const User = require('./models/User');

// 1. DECLARE APP FIRST


// 2. USE APP MIDDLEWARE SECOND

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 3. MONGODB LOCAL CONNECTION
// Commented out Cloud Atlas connection for now:
// mongoose.connect(process.env.MONGO_URI)

// Local MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/hut9')
  .then(() => console.log('Connected to Local MongoDB successfully!'))
  .catch(err => console.error('Local MongoDB connection error:', err));
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_123';
// UPDATED REGISTER ROUTE
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();

    res.status(201).json({ 
      message: 'Account created successfully! You can now log in.',
      user: { id: newUser._id, username: newUser.username, email: newUser.email }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.', error: error.message });
  }
});

// UPDATED LOGIN ROUTE
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide both email and password.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful!',
      token: token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        balance: user.balance
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error during login.', error: error.message });
  }
});
// --- MIDDLEWARE ---

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Dummy user profile and wallet endpoint
app.get('/api/user/profile', (req, res) => {
  res.json({
    username: "Polly",
    email: "polly@example.com",
    subscriptionTier: "VIP",
    walletBalance: 25000, // Mock balance in local currency
    purchasedImages: [101, 104, 208]
  });
});

// Dummy wallet top-up endpoint
app.post('/api/wallet/topup', (req, res) => {
  const { amount, paymentMethod } = req.body;
  res.json({
    success: true,
    message: `Mock top-up request for ${amount} via ${paymentMethod} received!`,
    newBalance: 25000 + Number(amount)
  });
});
// In-memory user database array (Replace with your actual Database like MongoDB or PostgreSQL)
const users = [];

// ==========================================
// 1. REGISTER ROUTE
// ==========================================
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Check if user already exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists.' });
    }

    // Hash the password securely (10 salt rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user object
    const newUser = {
      id: Date.now().toString(),
      username,
      email,
      password: hashedPassword,
      balance: 0,
      createdAt: new Date()
    };

    // Save user to memory/database
    users.push(newUser);

    res.status(201).json({ 
      message: 'Account created successfully! You can now log in.',
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error during registration.', error: error.message });
  }
});

// ==========================================
// 2. LOGIN ROUTE
// ==========================================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide both email and password.' });
    }

    // Find user by email
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Compare entered password with stored hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { userId: user.id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful!',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error during login.', error: error.message });
  }
});

// ------------------------------------------
// REGISTER ROUTE
// ------------------------------------------
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: 'user_' + Date.now(),
      name: name || 'User',
      email,
      password: hashedPassword,
      balance: 100000 // Default starting balance (e.g., UGX 100,000)
    };

    users.push(newUser);

    const token = jwt.sign({ userId: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email, balance: newUser.balance }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Registration failed.' });
  }
});

// ------------------------------------------
// LOGIN ROUTE
// ------------------------------------------
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, balance: user.balance }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
// -------------------------------------------------------------
// 1. PAYMENT ENDPOINT
// -------------------------------------------------------------
app.post('/api/pay', (req, res) => {
  const { phoneNumber, provider, amount, plan } = req.body;

  console.log(`[PAYMENT REQUEST] Received for ${plan}`);
  console.log(`Phone: ${phoneNumber} | Network: ${provider} | Amount: UGX ${amount}`);

  // Respond back to frontend
  res.json({
    success: true,
    message: `Prompt sent to ${phoneNumber} on ${provider.toUpperCase()}. Please confirm transaction on your phone.`,
    transactionId: 'HUT9-' + Date.now()
  });
});

// -------------------------------------------------------------
// 2. MOBILE MONEY DEPOSIT ENDPOINT (Triggers PIN prompt on phone)
// -------------------------------------------------------------
app.post('/api/mobile-money/deposit', async (req, res) =>{
  const { phoneNumber, amount, provider, email } = req.body;

  try {
    const tx_ref = `HUT9-DEP-${Date.now()}`;

    // Simulated Server Response for testing
    console.log(`[DEPOSIT REQUEST] UGX ${amount} to ${phoneNumber} (${provider})`);

    res.status(200).json({
      success: true,
      message: `USSD Prompt sent to ${phoneNumber}. Please enter your PIN on your phone.`,
      reference: tx_ref
    });

  } catch (error) {
    console.error('Payment Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate Mobile Money deposit.'
    });
  }
});

// -------------------------------------------------------------
// 3. WEBHOOK ENDPOINT FOR PAYMENT STATUS
// -------------------------------------------------------------
app.post('/api/mobile-money/webhook', (req, res) => {
  const secretHash = req.headers['verif-hash'];
  
  if (!secretHash || secretHash !== process.env.WEBHOOK_SECRET_HASH) {
    return res.status(401).end();
  }

  const payload = req.body;
  console.log('[PAYMENT WEBHOOK RECEIVED]:', payload);

  if (payload.status === 'successful') {
    const amount = payload.amount;
    const phone = payload.customer.phone_number;
    
    console.log(`✓ Payment Confirmed: UGX ${amount} from ${phone}`);
  }

  res.status(200).end();
});

// -------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------

// POST Endpoint: Handles tier subscriptions and balance deductions
// Temporary in-memory user store for testing
const testUser = {
  id: "user123",
  walletBalance: 10000000, // UGX 10,000,000 test balance
  unlockedTiers: []
};

// POST Endpoint: Handles tier subscriptions
app.post('/api/subscribe', (req, res) => {
  const { tierId, price } = req.body;

  // Check if already unlocked
  if (testUser.unlockedTiers.includes(tierId)) {
    return res.json({ 
      success: true, 
      message: "Already unlocked!", 
      unlockedTiers: testUser.unlockedTiers 
    });
  }

  // Check balance
  if (testUser.walletBalance < price) {
    return res.status(400).json({ 
      success: false, 
      message: "Insufficient wallet balance." 
    });
  }

  // Deduct balance and unlock tier
  testUser.walletBalance -= price;
  testUser.unlockedTiers.push(tierId);

  res.json({
    success: true,
    message: "Subscription successful!",
    newBalance: testUser.walletBalance,
    unlockedTiers: testUser.unlockedTiers
  });
});
// START SERVER (Keep at the very bottom of server.js)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`HUT 9 Server running on port ${PORT}`);
});
// GET Endpoint: Load unlocked tiers
app.get('/api/user-subscriptions/:userId', (req, res) => {
  res.json({
    success: true,
    unlockedTiers: testUser.unlockedTiers
  });
});
// GET Endpoint: Checks and returns unlocked tiers on page refresh
app.get('/api/user-subscriptions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Fetch user from DB (e.g., const user = await User.findById(userId);)

    res.json({
      success: true,
      unlockedTiers: user ? user.unlockedTiers : []
    });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    res.status(500).json({ success: false, message: "Server error loading subscriptions." });
  }
});
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`HUT 9 Server actively listening on http://localhost:${PORT}`);
  console.log(`=================================`);
});// Function to handle purchasing a subscription tier
async function subscribeToTier(tierName, cost) {
  const balanceElement = document.getElementById('wallet-balance');
  let currentBalance = parseFloat(balanceElement.innerText.replace(/[^0-9.-]+/g, '')) || 0;

  // 1. Check if user has sufficient funds
  if (currentBalance < cost) {
    alert(`Insufficient balance! You need UGX ${cost.toLocaleString()} to subscribe to ${tierName}. Please deposit funds first.`);
    return;
  }

  // 2. Confirm purchase with user
  const confirmPurchase = confirm(`Are you sure you want to subscribe to ${tierName} for UGX ${cost.toLocaleString()}?`);
  
  if (!confirmPurchase) return;

  try {
    // 3. Deduct tier cost from current balance
    let newBalance = currentBalance - cost;
    balanceElement.innerText = `UGX ${newBalance.toLocaleString()}`;

    alert(`🎉 Success! You have unlocked the ${tierName} tier.`);

    // 4. Update UI element state for this tier (Optional: disable button or change text to 'Unlocked')
    // Example: updateTierUI(tierName);

  } catch (error) {
    console.error('Error activating subscription:', error);
    alert('Something went wrong. Please try again.');
  }
}// Post route for processing subscriptions
app.post('/api/subscribe', (req, res) => {
  const { tierId, amount } = req.body;

  // 1. Fetch current user balance (replace with your variable or database query)
  // Example: let currentBalance = user.balance;
  
  if (currentBalance < amount) {
    return res.status(400).json({
      success: false,
      message: 'Insufficient wallet balance.'
    });
  }

  // 2. Deduct the cost from balance
  currentBalance -= amount;

  // 3. Save the updated balance to your database/session here

  // 4. Return success response along with the exact new balance
  return res.status(200).json({
    success: true,
    message: 'Subscription successful!',
    newBalance: currentBalance,
    tierId: tierId
  });
});// Example in-memory user database (Replace or adapt with your real database model)
// e.g., const User = require('./models/User');

app.post('/api/subscribe', async (req, res) => {
  try {
    const { userId, tierId, price } = req.body;

    // 1. Fetch the user from your database
    // For this example, let's assume 'user' object:
    // const user = await User.findById(userId);

    // Placeholder user object structure for illustration:
    /*
    let user = {
      id: userId,
      walletBalance: 50000, // Example UGX balance
      unlockedTiers: []
    };
    */

    // Check if already unlocked
    if (user.unlockedTiers.includes(tierId)) {
      return res.status(400).json({ success: false, message: "Tier already unlocked." });
    }

    // 2. Check if user has enough balance
    if (user.walletBalance < price) {
      return res.status(400).json({ 
        success: false, 
        message: "Insufficient wallet balance. Please top up your wallet." 
      });
    }

    // Deduct the money and add tier to unlocked list
    user.walletBalance -= price;
    user.unlockedTiers.push(tierId);

    // Save user update to DB (e.g., await user.save();)

    // Return success response to frontend
    res.json({
      success: true,
      message: "Subscription successful!",
      newBalance: user.walletBalance,
      unlockedTiers: user.unlockedTiers
    });

  } catch (error) {
    console.error("Subscription Error:", error);
    res.status(500).json({ success: false, message: "Server error during subscription." });
  }
});

// Endpoint to fetch current user's unlocked tiers on page load (Step 3)
app.get('/api/user-subscriptions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    // const user = await User.findById(userId);
    
    res.json({
      success: true,
      unlockedTiers: user.unlockedTiers || []
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching subscriptions." });
  }
});app.post('/api/subscribe', async (req, res) => {
  const { userId, tierId, price } = req.body;

  // 1. Fetch user from database
  // 2. Check if user.balance >= price
  // 3. Deduct price from user.balance
  // 4. Save new active investment to database

  if (userBalance >= price) {
    // Process deduction & save subscription
    return res.json({ success: true, message: 'Purchased successfully' });
  } else {
    return res.status(400).json({ success: false, message: 'Insufficient balance' });
  }
});

// Temporary array or replace with your database user query (e.g., MongoDB, MySQL, SQLite)
// const users = []; 

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    // 1. Check if user already exists in your database
    // const existingUser = await User.findOne({ email });
    // if (existingUser) return res.status(400).json({ success: false, message: 'Email already registered.' });

    // 2. Hash the user password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 3. Save new user object to your database
    const newUser = {
      id: Date.now().toString(),
      username,
      email,
      password: hashedPassword,
      walletBalance: 0 // Initial wallet balance set to zero
    };

    // await newUser.save(); / users.push(newUser);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});
// ==========================================
// MOBILE MONEY DEPOSIT ENDPOINT
// ==========================================
app.post('/api/deposit', async (req, res) => {
  try {
    const { userId, phoneNumber, network, amount } = req.body;

    if (!userId || !phoneNumber || !network || !amount) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (amount < 500) {
      return res.status(400).json({ message: 'Minimum deposit amount is UGX 500.' });
    }

    // Find the user in the database
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // UPDATE USER BALANCE
    user.balance += Number(amount);
    await user.save();

    res.status(200).json({
      message: `Deposit of UGX ${amount} via ${network} initiated for ${phoneNumber}!`,
      newBalance: user.balance
    });

  } catch (error) {
    res.status(500).json({ message: 'Error processing deposit.', error: error.message });
  }
});
// ==========================================
// MACHINE INVESTMENT ENDPOINT
// ==========================================
app.post('/api/invest', authenticateToken, async (req, res) => {
  try {
    const { userId, machineName, price, dailyProfit, durationDays } = req.body;

    if (!userId || !machineName || !price || !dailyProfit) {
      return res.status(400).json({ message: 'Missing required investment details.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Check if user has enough wallet balance
    if (user.balance < price) {
      return res.status(400).json({ message: 'Insufficient wallet balance. Please deposit funds first.' });
    }

    // Deduct purchase price from balance
    user.balance -= Number(price);
    
    // Save active investment to user document
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (durationDays || 30));

    if (!user.investments) user.investments = [];
    user.investments.push({
      machineName,
      price,
      dailyProfit,
      startDate: new Date(),
      expiryDate,
      active: true
    });

    await user.save();

    res.status(200).json({
      message: `Successfully purchased ${machineName}! Investment is now active.`,
      newBalance: user.balance,
      investments: user.investments
    });

  } catch (error) {
    res.status(500).json({ message: 'Error processing machine purchase.', error: error.message });
  }
});
// ==========================================
// WITHDRAWAL REQUEST ENDPOINT
// ==========================================
app.post('/api/withdraw', authenticateToken, async (req, res) => {
  try {
    const { userId, phoneNumber, network, amount } = req.body;

    if (!userId || !phoneNumber || !network || !amount) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const withdrawAmount = Number(amount);
    const minWithdrawal = 5000; // Minimum limit e.g. UGX 5,000

    if (withdrawAmount < minWithdrawal) {
      return res.status(400).json({ message: `Minimum withdrawal amount is UGX ${minWithdrawal.toLocaleString()}.` });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // 1. Calculate Withdrawal Fee (e.g., 3%)
    const feeRate = 0.03;
    const fee = withdrawAmount * feeRate;
    const netPayout = withdrawAmount - fee;

    // 2. Check sufficient balance
    if (user.balance < withdrawAmount) {
      return res.status(400).json({ message: 'Insufficient wallet balance for this withdrawal.' });
    }

    // 3. Deduct total amount from user balance immediately
    user.balance -= withdrawAmount;
    await user.save();

    // 4. Save pending withdrawal record (stored in memory/array or database collection)
    const withdrawalRecord = {
      id: Date.now().toString(),
      userId: user._id,
      username: user.username,
      phoneNumber,
      network,
      amount: withdrawAmount,
      fee,
      netPayout,
      status: 'Pending', // Pending, Approved, Rejected
      createdAt: new Date()
    };

    res.status(200).json({
      message: `Withdrawal request of UGX ${withdrawAmount.toLocaleString()} submitted! Payout of UGX ${netPayout.toLocaleString()} (after 3% fee) is pending approval.`,
      newBalance: user.balance,
      withdrawal: withdrawalRecord
    });

  } catch (error) {
    res.status(500).json({ message: 'Error processing withdrawal request.', error: error.message });
  }
});
// In-memory pending withdrawal store (or tie to Withdrawal model)
let pendingWithdrawalsList = [];

// ==========================================
// ADMIN DASHBOARD DATA ENDPOINT
// ==========================================
app.get('/api/admin/dashboard', authenticateToken, async (req, res) => {
  try {
// Ensure user is an admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
    }
    const allUsers = await User.find();
    
    // Sum total system balance across all users
    const totalSystemBalance = allUsers.reduce((sum, u) => sum + (u.balance || 0), 0);

    res.status(200).json({
      totalUsers: allUsers.length,
      pendingWithdrawals: pendingWithdrawalsList,
      totalSystemBalance
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admin metrics.' });
  }
});

// ==========================================
// APPROVE WITHDRAWAL ROUTE
// ==========================================
app.post('/api/admin/withdraw/approve', async (req, res) => {
  try {
    const { withdrawalId } = req.body;
    
    const index = pendingWithdrawalsList.findIndex(w => w.id === withdrawalId);
    if (index === -1) {
      return res.status(404).json({ message: 'Withdrawal request not found.' });
    }

    // Remove from pending list (payout complete)
    pendingWithdrawalsList.splice(index, 1);

    res.status(200).json({ message: 'Withdrawal request approved and marked as Paid.' });
  } catch (error) {
    res.status(500).json({ message: 'Error processing approval.' });
  }
});

// ==========================================
// REJECT WITHDRAWAL ROUTE (Refunds Balance)
// ==========================================
app.post('/api/admin/withdraw/reject', async (req, res) => {
  try {
    const { withdrawalId } = req.body;

    const index = pendingWithdrawalsList.findIndex(w => w.id === withdrawalId);
    if (index === -1) {
      return res.status(404).json({ message: 'Withdrawal request not found.' });
    }

    const request = pendingWithdrawalsList[index];

    // Refund the debited amount back to user's wallet
    const user = await User.findById(request.userId);
    if (user) {
      user.balance += request.amount;
      await user.save();
    }

    // Remove from pending list
    pendingWithdrawalsList.splice(index, 1);

    res.status(200).json({ message: 'Withdrawal request rejected. Funds have been refunded to the user.' });
  } catch (error) {
    res.status(500).json({ message: 'Error processing rejection.' });
  }
});
// ==========================================
// 404 FALLBACK & ERROR HANDLER (PHASE 13)
// ==========================================

// Handle unknown API endpoints
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'API endpoint not found.' });
});

// Global internal server error middleware
app.use((err, req, res, next) => {
  console.error('Unhandled System Error:', err.stack);
  res.status(500).json({ message: 'An internal server error occurred. Please try again later.' });
});