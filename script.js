// Define your backend port URL
const API_URL = 'http://localhost:3000'; // Replace 3000 with your Express backend port

// Attach function to window so HTML onclick can access it
window.subscribeToTier = async function(tierId, price) {
  const userId = 'user123'; // Replace with actual logged-in user ID or variable

  try {
    const response = await fetch(`${API_URL}/api/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId, tierId, price })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast('Investment successful! Image unlocked.', 'success');
      unlockImageUI(tierId);
    } else {
      showToast(data.message || 'Insufficient balance or transaction failed.', 'error');
    }
  } catch (error) {
    console.error('Error during purchase:', error);
    showToast('Failed to connect to backend server.', 'error');
  }
};// ==========================================
// 1. STATE & WALLET INITIALIZATION (MUST BE AT TOP)
// ==========================================
let userWallet = JSON.parse(localStorage.getItem('hut9_wallet')) || {
  balance: 0,
  dailyProfit: 0,
  unlockedPlans: []
};

let unlockedTiers = {
  basic: false,
  vip: false
};

let currentSelectedPlan = {
  name: '',
  price: 0,
  returnRate: 0
};

// Initialize Wallet UI when DOM loads
document.addEventListener("DOMContentLoaded", () => {
  renderWallet();
});

function renderWallet() {
  const walletBalanceEl = document.getElementById('wallet-balance');
  const dailyProfitEl = document.getElementById('daily-profit');

  if (walletBalanceEl) walletBalanceEl.innerText = `UGX ${userWallet.balance.toLocaleString()}`;
  if (dailyProfitEl) dailyProfitEl.innerText = `+ UGX ${userWallet.dailyProfit.toLocaleString()} / day`;

  localStorage.setItem('hut9_wallet', JSON.stringify(userWallet));
}

// ==========================================
// 2. IMAGE PREVIEW & MODAL CONTROLS
// ==========================================
function openImagePreview(imageSrc, caption) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img-display');
  const captionText = document.getElementById('modal-img-caption');

  if (modal) modal.style.display = 'flex';
  if (modalImg) modalImg.src = imageSrc;
  if (captionText) captionText.innerText = caption;
}

function closeImageModal() {
  const modal = document.getElementById('image-modal');
  if (modal) modal.style.display = 'none';
}

function handleLockedClick(planName, price) {
  if (planName === 'Basic Tier' && unlockedTiers.basic) {
    openImagePreview('images/sample.jpg', 'Premium Landscape - Unlocked');
  } else if (planName === 'VIP Tier' && unlockedTiers.vip) {
    openImagePreview('images/sample.jpg', 'Ultra HD Wallpapers - Unlocked');
  } else {
    openPaymentModal(planName, price, 10); // Default rate if omitted
  }
}

// ==========================================
// 3. PAYMENT MODAL & TRANSACTIONS
// ==========================================
function openPaymentModal(planName, price, returnPercentage = 0) {
  currentSelectedPlan = { 
    name: planName, 
    price: price, 
    returnRate: returnPercentage 
  };
  
  const monthlyProfit = (price * returnPercentage) / 100;
  const dailyProfit = Math.round(monthlyProfit / 30);

  const selectedPlanText = document.getElementById('selected-plan-text');
  if (selectedPlanText) {
    selectedPlanText.innerHTML = `
      <strong>Plan:</strong> ${planName}<br>
      <strong>Price:</strong> UGX ${price.toLocaleString()}<br>
      <strong>Est. Daily Earnings:</strong> +UGX ${dailyProfit.toLocaleString()} / day
    `;
  }
  
  const payModal = document.getElementById('payment-modal');
  if (payModal) payModal.style.display = 'flex';
}

function closePaymentModal() {
  const payModal = document.getElementById('payment-modal');
  if (payModal) payModal.style.display = 'none';
}

async function processPayment(event) {
  event.preventDefault();

  const phone = document.getElementById('phone').value;
  const provider = document.getElementById('provider').value;

  const payload = {
    phoneNumber: phone,
    provider: provider,
    amount: currentSelectedPlan.price,
    plan: currentSelectedPlan.name
  };

  try {
    const response = await fetch('/api/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.success) {
      alert(data.message);

      if (currentSelectedPlan.name === 'Basic Tier') {
        unlockBasicTier();
      } else if (currentSelectedPlan.name === 'VIP Tier') {
        unlockVipTier();
        unlockBasicTier();
      }

      closePaymentModal();
    } else {
      alert('Payment initialization failed. Please try again.');
    }
  } catch (error) {
    console.error('Error contacting backend server:', error);
    alert('Could not connect to backend server. Make sure node server.js is running.');
  }
}

// ==========================================
// 4. UNLOCKING & WALLET UPDATES
// ==========================================
function unlockBasicTier() {
  unlockedTiers.basic = true;
  const basicImg = document.getElementById('basic-img');
  const basicLock = document.getElementById('basic-lock');
  const basicDesc = document.getElementById('basic-desc');

  if (basicImg) basicImg.classList.remove('blur-img');
  if (basicLock) basicLock.style.display = 'none';
  if (basicDesc) basicDesc.innerText = '✓ Unlocked! Click to view high-res image.';
}

function unlockVipTier() {
  unlockedTiers.vip = true;
  const vipImg = document.getElementById('vip-img');
  const vipLock = document.getElementById('vip-lock');
  const vipDesc = document.getElementById('vip-desc');

  if (vipImg) vipImg.classList.remove('blur-img');
  if (vipLock) vipLock.style.display = 'none';
  if (vipDesc) vipDesc.innerText = '✓ Unlocked! Click to view 4K Ultra HD.';
}

function updateWalletUI(amountPaid, returnRate) {
  const monthlyProfit = (amountPaid * returnRate) / 100;
  const dailyRate = Math.round(monthlyProfit / 30);

  userWallet.balance += amountPaid;
  userWallet.dailyProfit += dailyRate;

  renderWallet();
}

// ==========================================
// 5. DEPOSIT MODAL FUNCTIONS
// ==========================================
function openDepositModal() {
  const modal = document.getElementById('deposit-modal');
  if (modal) modal.style.display = 'flex';
}

function closeDepositModal() {
  const modal = document.getElementById('deposit-modal');
  if (modal) modal.style.display = 'none';
}

async function processDeposit(event) {
  event.preventDefault();
  
  const amount = parseInt(document.getElementById('deposit-amount').value);
  const phone = document.getElementById('deposit-phone').value;
const provider = document.getElementById('deposit-provider').value;

  if (amount < 5000) {
    alert('Minimum deposit amount is UGX 5,000');
    return;
  }

  try {
    // Updated to full localhost:3000 backend URL
    const response = await fetch('http://localhost:3000/api/mobile-money/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amount,
        phoneNumber: phone,
        provider: provider
      })
    });

    const data = await response.json();

    if (data.success) {
      alert(data.message);
      
      userWallet.balance += amount;
      renderWallet();
      closeDepositModal();
    } else {
      alert('Transaction Error: ' + data.message);
    }
  } catch (err) {
    console.error('Network Error:', err);
    alert('Could not connect to server.js. Make sure Node.js is running in your terminal!');
  }
}

// ==========================================
// 6. WITHDRAWAL & PLAN SUBSCRIPTION
// ==========================================
function openWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (modal) modal.style.display = 'flex';
}

function closeWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (modal) modal.style.display = 'none';
}

function processWithdraw(event) {
  event.preventDefault();
  const amount = parseInt(document.getElementById('withdraw-amount').value);
  const phone = document.getElementById('withdraw-phone').value;
  const provider = document.getElementById('withdraw-provider').value.toUpperCase();

  if (amount > userWallet.balance) {
    alert('Insufficient wallet balance!');
    return;
  }

  if (amount < 5000) {
    alert('Minimum withdrawal amount is UGX 5,000');
    return;
  }

  userWallet.balance -= amount;
  renderWallet();

  alert(`Withdrawal Request Submitted!\nUGX ${amount.toLocaleString()} will be sent to ${phone} (${provider}) after processing.`);
  closeWithdrawModal();
}

function subscribeToPlan(planName, price, returnRate, imgElementId) {
  if (userWallet.balance < price) {
    alert(`Insufficient balance! You need UGX ${price.toLocaleString()} to subscribe to ${planName}. Opening deposit window...`);
    openDepositModal();
    return;
  }

  userWallet.balance -= price;
  const monthlyProfit = (price * returnRate) / 100;
  const dailyRate = Math.round(monthlyProfit / 30);
  userWallet.dailyProfit += dailyRate;

  userWallet.unlockedPlans.push(planName);
  renderWallet();

  const cardImg = document.getElementById(imgElementId);
  if (cardImg) {
    cardImg.classList.remove('blur-img');
  }

  alert(`Congratulations! You subscribed to ${planName}.\nDaily earnings increased by +UGX ${dailyRate.toLocaleString()}/day.`);
}
// Store active user subscriptions
let userSubscriptions = []; 

// Retain current logged-in user ID (or fallback)
const currentUserId = localStorage.getItem('userId') || "user123"; 

function handleSubscribe(tierId, price) {
  if (userSubscriptions.includes(tierId)) {
    unlockCardImage(tierId);
    alert("This tier is already unlocked!");
    return;
  }

  const confirmPayment = confirm(`Subscribe to unlock this tier for UGX ${price.toLocaleString()}?`);
  
  if (confirmPayment) {
    processPayment(tierId, price);
  }
}

// Connects to your server.js /api/subscribe route
async function processPayment(tierId, price) {
  try {
   const response = await fetch('http://localhost:3000/api/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: currentUserId,
        tierId: tierId,
        price: price
      })
    });

    const data = await response.json();

    if (data.success) {
      userSubscriptions.push(tierId);
      unlockCardImage(tierId);

      // Updates wallet display on your page if element exists
      const balanceElement = document.getElementById('user-wallet-balance');
      if (balanceElement && data.newBalance !== undefined) {
        balanceElement.textContent = `UGX ${data.newBalance.toLocaleString()}`;
      }

      alert("Subscription successful! Content unlocked.");
    } else {
      alert(`Payment Failed: ${data.message}`);
    }
  } catch (error) {
    console.error("Error communicating with server:", error);
    alert("An error occurred while connecting to the server.");
  }
}

// Robust function to unblur image and mark tier unlocked
function unlockCardImage(tierId) {
  const cardElement = document.getElementById(tierId);
  if (cardElement) {
    // Also remove the locked class from the card container if present
    cardElement.classList.remove('locked-card', 'locked');
    cardElement.classList.add('unlocked');

    // Target any image inside this card
    const imgElement = cardElement.querySelector('img');
    if (imgElement) {
      imgElement.classList.remove('locked', 'blur-img');
      imgElement.classList.add('unlocked');
      // Force remove blur inline so CSS won't override it
      imgElement.style.filter = 'none';
      imgElement.style.webkitFilter = 'none';
    }
  } else {
    console.warn(`Card element with ID "${tierId}" not found in HTML.`);
  }
}
// Automatically fetch and unlock purchased tiers on page load
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch(`http://localhost:3000/api/user-subscriptions/${currentUserId}`);
    const data = await response.json();

    if (data.success && data.unlockedTiers) {
      userSubscriptions = data.unlockedTiers;
usersubscriptions.forEach(tierId => {
        unlockCardImage(tierId);
      });
    }
  } catch (error) {
    console.error("Could not load user subscriptions on startup:", error);
  }
});function unlockImageUI(tierId) {
  const card = document.querySelector(`[data-tier-id="${tierId}"]`);
  if (card) {
    const image = card.querySelector('img');
    if (image) {
      image.classList.remove('blurred'); // Removes CSS blur
      image.style.filter = 'none';
    }
    
    const button = card.querySelector('.buy-btn');
    if (button) {
      button.innerText = 'Unlocked / Active';
      button.disabled = true;
      button.classList.add('unlocked-btn');
    }
  }
}// ==========================================
// AUTHENTICATION MANAGEMENT
// ==========================================

// Handle User Login
async function loginUser(email, password) {
  try {
    const response = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

   if (response.ok && data.success) {
    // Save session info in localStorage
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.user.id);
    localStorage.setItem('userName', data.user.name);

    showToast('Login successful!', 'success');
    updateNavUI();
    loadUserSubscriptions(data.user.id);
  } else {
    showToast(data.message || 'Login failed.', 'error');
  }
} catch (error) {
  console.error('Login Error:', error);
  showToast('Server error during login.', 'error');
}
}
// Handle User Logout
function logoutUser() {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('userName');
  
  alert('You have logged out.');
  updateNavUI();
  window.location.reload(); // Refresh page to clear user state
}

// Update UI based on authentication status
function updateNavUI() {
  const token = localStorage.getItem('token');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userGreeting = document.getElementById('user-greeting');

  if (token) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    if (userGreeting) {
      userGreeting.style.display = 'inline-block';
      userGreeting.innerText = `Welcome, ${localStorage.getItem('userName') || 'User'}`;
    }
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userGreeting) userGreeting.style.display = 'none';
  }
}

// Attach logout listener to globally accessible window
window.logoutUser = logoutUser;
// Toggle UI based on whether user token exists in localStorage
function updateNavUI() {
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('userName');
  const userBalance = localStorage.getItem('userBalance') || '0';

  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userGreeting = document.getElementById('user-greeting');
  const balanceDisplay = document.getElementById('user-balance');

  if (token) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    if (userGreeting) {
      userGreeting.style.display = 'inline-block';
      userGreeting.innerText = `Welcome, ${userName || 'User'}`;
    }
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userGreeting) userGreeting.style.display = 'none';
  }

  if (balanceDisplay) {
    balanceDisplay.innerText = `UGX ${Number(userBalance).toLocaleString()}`;
  }
}

// Simple prompt-based login for instant testing
async function handleLoginClick() {
  const email = prompt('Enter your email:');
  const password = prompt('Enter your password:');

  if (!email || !password) return;

  try {
    const response = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.user.id);
      localStorage.setItem('userName', data.user.name);
      localStorage.setItem('userBalance', data.user.balance);

      alert('Logged in successfully!');
      updateNavUI();
      loadUserSubscriptions(data.user.id);
    } else {
      alert(data.message || 'Login failed.');
    }
  } catch (error) {
    console.error('Login Error:', error);
    alert('Failed to connect to backend server.');
  }
}

// Handle Logout
function logoutUser() {
  localStorage.clear();
  alert('You have logged out.');
  updateNavUI();
  window.location.reload();
}

// Ensure function is exposed globally
window.logoutUser = logoutUser;
window.handleLoginClick = handleLoginClick;

// Run UI check automatically as soon as DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  updateNavUI();
});
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const messageEl = document.getElementById('registerMessage');

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();

    if (data.success) {
      messageEl.style.color = 'green';
      messageEl.textContent = 'Account created successfully! Redirecting to login...';
      setTimeout(() => {
        window.location.href = '/login.html'; // Adjust redirect path as needed
      }, 1500);
    } else {
      messageEl.style.color = 'red';
      messageEl.textContent = data.message || 'Registration failed.';
    }
  } catch (error) {
    messageEl.style.color = 'red';
    messageEl.textContent = 'An error occurred. Please try again.';
  }
});
function logoutUser() {
  // Clear stored auth details
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  alert('You have been logged out.');
  window.location.href = 'login.html';
}
document.addEventListener('DOMContentLoaded', () => {
  const user = JSON.parse(localStorage.getItem('user'));
  const token = localStorage.getItem('token');

  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const greeting = document.getElementById('user-greeting');
  const balance = document.getElementById('user-balance');

  if (user && token) {
    // User is logged in
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';

    if (greeting) {
      greeting.textContent = `Hello, ${user.username}!`;
      greeting.style.display = 'inline';
    }

    if (balance) {
      balance.textContent = `UGX ${user.balance || 0}`;
    }
  } else {
    // User is logged out
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (greeting) greeting.style.display = 'none';
  }
});
function handleDeposit() {
  document.getElementById('deposit-modal').style.display = 'flex';
}

function closeDepositModal() {
  document.getElementById('deposit-modal').style.display = 'none';
}
async function submitDeposit() {
    const user = JSON.parse(localStorage.getItem('user'));
    const phoneNumber = document.getElementById('dep-phone').value;
    const network = document.getElementById('dep-network').value;
    const amount = document.getElementById('dep-amount').value;

    if (!phoneNumber || !amount) {
        showToast('Please enter both phone number and amount.', 'error');
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user._id, phoneNumber, network, amount })
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message || 'Deposit successful!', 'success');

            // Update local storage and UI
            user.balance = data.newBalance;
            localStorage.setItem('user', JSON.stringify(user));

            const balanceSpan = document.getElementById('user-balance');
            const dashBalance = document.getElementById('dash-balance');
            if (balanceSpan) balanceSpan.textContent = `UGX ${data.newBalance.toLocaleString()}`;
            if (dashBalance) dashBalance.textContent = `UGX ${data.newBalance.toLocaleString()}`;
            
            closeDepositModal();
        } else {
            showToast(data.message || 'Deposit failed.', 'error');
        }
    } catch (err) {
        showToast('Error connecting to server.', 'error');
    }
}
function handleWithdraw() {
  document.getElementById('withdraw-modal').style.display = 'flex';
}

function closeWithdrawModal() {
  document.getElementById('withdraw-modal').style.display = 'none';
}

async function submitWithdrawal() {
  const user = JSON.parse(localStorage.getItem('user'));
  const phoneNumber = document.getElementById('with-phone').value;
  const network = document.getElementById('with-network').value;
  const amount = document.getElementById('with-amount').value;

  if (!phoneNumber || !amount) {
    alert('Please enter both phone number and amount.');
    return;
  }

  try {
    const response = await fetch('http://localhost:3000/api/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id || user._id,
        phoneNumber,
        network,
        amount
      })
    });

    const data = await response.json();

   if (response.ok) {
  showToast(data.message, 'success');
} else {
  showToast(data.message || 'Withdrawal failed.', 'error');
}
      // Update local storage and UI balance
      user.balance = data.newBalance;
      localStorage.setItem('user', JSON.stringify(user));
if (data.success) {
      const dashBalance = document.getElementById('dash-balance');
      const navBalance = document.getElementById('user-balance');
      if (dashBalance) dashBalance.textContent = `UGX ${data.newBalance.toLocaleString()}`;
      if (navBalance) navBalance.textContent = `UGX ${data.newBalance.toLocaleString()}`;

      closeWithdrawModal();
    } else {
      alert(data.message || 'Withdrawal request failed.');
    }
  } catch (err) {
    alert('Error connecting to server.');
  }

function sanitizeInput(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
// Universal Toast Notification Handler
function showToast(message, type = 'success', duration = 3000) {
  let container = document.getElementById('toast-container');

  // Dynamically build container if missing
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;

  container.appendChild(toast);

  // Automatically fade out and remove after duration
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, duration);
}
}
function logoutUser() {
  // Clear all stored auth details
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('userId');
  localStorage.removeItem('userName');

  showToast('Logged out successfully!', 'success');

  setTimeout(() => {
    window.location.href = 'login.html';
  }, 1000);
}