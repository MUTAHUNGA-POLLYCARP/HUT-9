// ==========================================
// 1. ENVIRONMENT & GLOBAL CONFIGURATION
// ==========================================
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : window.location.origin; // Dynamically uses the current origin (https://hut-9.onrender.com)

let userSubscriptions = []; 

let userWallet = JSON.parse(localStorage.getItem('hut9_wallet')) || {
  balance: 0,
  dailyProfit: 0,
  unlockedPlans: []
};

let currentSelectedPlan = {
  name: '',
  price: 0,
  returnRate: 40
};

// ==========================================
// 2. INITIALIZATION & AUTH UI MANAGEMENT
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  renderWallet();
  updateNavUI();
  await handlePesapalReturnCallback();
  await syncUserDataAndCheckUnlocks();

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegisterSubmit);
  }
});

function renderWallet() {
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const currentBalance = user.balance !== undefined ? user.balance : userWallet.balance;

  const walletBalanceEl = document.getElementById('wallet-balance');
  const dashBalanceEl = document.getElementById('dash-balance');
  const userBalanceEl = document.getElementById('user-balance');
  const dailyProfitEl = document.getElementById('daily-profit');

  const formattedBalance = `UGX ${Number(currentBalance).toLocaleString()}`;

  if (walletBalanceEl) walletBalanceEl.innerText = formattedBalance;
  if (dashBalanceEl) dashBalanceEl.innerText = formattedBalance;
  if (userBalanceEl) userBalanceEl.innerText = formattedBalance;
  if (dailyProfitEl) dailyProfitEl.innerText = `+ UGX ${Number(userWallet.dailyProfit).toLocaleString()} / day`;

  userWallet.balance = currentBalance;
  localStorage.setItem('hut9_wallet', JSON.stringify(userWallet));
}

function updateNavUI() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const userName = localStorage.getItem('userName') || user.username || 'User';

  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userGreeting = document.getElementById('user-greeting');

  if (token) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    if (userGreeting) {
      userGreeting.style.display = 'inline-block';
      userGreeting.innerText = `Welcome, ${userName}`;
    }
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (signupBtn) signupBtn.style.display = 'inline-block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userGreeting) userGreeting.style.display = 'none';
  }

  renderWallet();
}

// ==========================================
// 3. AUTHENTICATION ACTIONS
// ==========================================
async function loginUser(email, password) {
  try {
    const response = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.user.id || data.user._id);
      localStorage.setItem('userName', data.user.username);
      localStorage.setItem('user', JSON.stringify(data.user));

      showToast('Login successful!', 'success');
      updateNavUI();
      await syncUserDataAndCheckUnlocks();

      window.location.href = 'dashboard.html';
    } else {
      showToast(data.message || 'Login failed.', 'error');
    }
  } catch (error) {
    console.error('Login Error:', error);
    showToast('Server error during login.', 'error');
  }
}

async function handleLoginClick() {
  const email = prompt('Enter your email:');
  const password = prompt('Enter your password:');

  if (!email || !password) return;
  await loginUser(email, password);
}

function logoutUser() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('userId');
  localStorage.removeItem('userName');
  localStorage.removeItem('userBalance');

  showToast('Logged out successfully!', 'success');
  updateNavUI();

  setTimeout(() => {
    window.location.href = 'login.html';
  }, 1000);
}

async function handleRegisterSubmit(e) {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const messageEl = document.getElementById('registerMessage');

  try {
    const response = await fetch(`${API_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();

    if (data.success) {
      if (messageEl) {
        messageEl.style.color = 'green';
        messageEl.textContent = 'Account created successfully! Redirecting to login...';
      }
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 1500);
    } else {
      if (messageEl) {
        messageEl.style.color = 'red';
        messageEl.textContent = data.message || 'Registration failed.';
      }
    }
  } catch (error) {
    if (messageEl) {
      messageEl.style.color = 'red';
      messageEl.textContent = 'An error occurred. Please try again.';
    }
  }
}

window.logoutUser = logoutUser;
window.handleLoginClick = handleLoginClick;

// ==========================================
// 4. AUTOMATIC TIER UNLOCK & DATA SYNC
// ==========================================
async function syncUserDataAndCheckUnlocks() {
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const userId = user.id || user._id || localStorage.getItem('userId');

  if (!userId) return;

  try {
    const response = await fetch(`${API_URL}/api/user-status/${userId}`);
    const data = await response.json();

    if (data.success) {
      user.balance = data.balance;
      localStorage.setItem('user', JSON.stringify(user));
      userSubscriptions = data.unlockedTiers || [];

      renderWallet();
      evaluateAutoUnlockTiers(data.balance, userSubscriptions);
    }
  } catch (error) {
    console.error('Error fetching user status:', error);
  }
}

async function handlePesapalReturnCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const orderTrackingId = urlParams.get('OrderTrackingId') || urlParams.get('orderTrackingId');
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const userId = user.id || user._id || localStorage.getItem('userId');

  if (orderTrackingId && userId) {
    try {
      showToast('Verifying payment with Pesapal...', 'success');
      const response = await fetch(`${API_URL}/api/pesapal/check-status?orderTrackingId=${orderTrackingId}&userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        showToast('Deposit verified! Balance updated.', 'success');
        user.balance = data.newBalance;
        localStorage.setItem('user', JSON.stringify(user));
        renderWallet();
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Error verifying payment callback:', err);
    }
  }
}

function evaluateAutoUnlockTiers(currentBalance, unlockedTiersList) {
  const tierCards = document.querySelectorAll('.card, [data-price]');

  tierCards.forEach(card => {
    const price = Number(card.getAttribute('data-price') || 0);
    const tierId = card.getAttribute('data-tier-id') || card.id;

    if ((price > 0 && currentBalance >= price) || unlockedTiersList.includes(tierId)) {
      unlockCardImage(card);
    }
  });
}

function unlockCardImage(cardOrId) {
  let cardElement = typeof cardOrId === 'string' ? document.getElementById(cardOrId) : cardOrId;
  
  if (!cardElement && typeof cardOrId === 'string') {
    cardElement = document.querySelector(`[data-tier-id="${cardOrId}"]`);
  }

  if (cardElement) {
    cardElement.classList.remove('locked-card', 'locked');
    cardElement.classList.add('unlocked');

    const imgElement = cardElement.querySelector('img');
    if (imgElement) {
      imgElement.classList.remove('locked', 'blur-img', 'blurred');
      imgElement.style.filter = 'none';
      imgElement.style.webkitFilter = 'none';
    }
  }
}

// ==========================================
// 5. SUBSCRIPTION LOGIC
// ==========================================
window.subscribeToTier = async function(tierId, price) {
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const userId = user.id || user._id || localStorage.getItem('userId');

  if (!userId) {
    showToast('Please log in to subscribe.', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, tierId, price: Number(price) })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast(data.message || 'Subscription successful! Image unlocked.', 'success');

      user.balance = data.newBalance;
      localStorage.setItem('user', JSON.stringify(user));

      if (data.earnings) {
        userWallet.dailyProfit += data.earnings.dailyEarnings;
      }

      unlockCardImage(tierId);
      renderWallet();
    } else {
      showToast(data.message || 'Insufficient balance or transaction failed.', 'error');
      if (data.message && data.message.toLowerCase().includes('balance')) {
        openDepositModal();
      }
    }
  } catch (error) {
    console.error('Error during purchase:', error);
    showToast('Failed to connect to backend server.', 'error');
  }
};

// ==========================================
// 6. DEPOSIT & WITHDRAWAL HANDLERS
// ==========================================
function openDepositModal() {
  const modal = document.getElementById('deposit-modal');
  if (modal) modal.style.display = 'flex';
}

function handleDeposit() {
  openDepositModal();
}

function closeDepositModal() {
  const modal = document.getElementById('deposit-modal');
  if (modal) modal.style.display = 'none';
}

async function submitDeposit() {
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const userId = user.id || user._id || localStorage.getItem('userId');
  const phoneNumber = document.getElementById('dep-phone')?.value || document.getElementById('deposit-phone')?.value;
  const network = document.getElementById('dep-network')?.value || document.getElementById('deposit-provider')?.value || 'MTN';
  const amount = document.getElementById('dep-amount')?.value || document.getElementById('deposit-amount')?.value;

  if (!userId) {
    showToast('Please log in first.', 'error');
    return;
  }

  if (!phoneNumber || !amount) {
    showToast('Please enter both phone number and amount.', 'error');
    return;
  }

  if (Number(amount) < 500) {
    showToast('Minimum deposit amount is UGX 500.', 'error');
    return;
  }

  try {
    showToast('Connecting to Pesapal Mobile Money...', 'success');

    const response = await fetch(`${API_URL}/api/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, phoneNumber, network, amount: Number(amount) })
    });

    const data = await response.json();
    const redirectUrl = data.redirect_url || data.redirectUrl;

    if (data.success && redirectUrl) {
      closeDepositModal();
      window.location.href = redirectUrl;
    } else {
      showToast(data.message || 'Deposit failed.', 'error');
    }
  } catch (err) {
    console.error('Deposit network error:', err);
    showToast('Error connecting to server.', 'error');
  }
}

function openWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (modal) modal.style.display = 'flex';
}

function handleWithdraw() {
  openWithdrawModal();
}

function closeWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (modal) modal.style.display = 'none';
}

async function submitWithdrawal() {
  const user = JSON.parse(localStorage.getItem('user')) || {};
  const token = localStorage.getItem('token');
  const userId = user.id || user._id || localStorage.getItem('userId');
  const phoneNumber = document.getElementById('with-phone')?.value || document.getElementById('withdraw-phone')?.value;
  const network = document.getElementById('with-network')?.value || document.getElementById('withdraw-provider')?.value || 'MTN';
  const amount = document.getElementById('with-amount')?.value || document.getElementById('withdraw-amount')?.value;

  if (!userId) {
    showToast('Please log in first.', 'error');
    return;
  }

  if (!phoneNumber || !amount) {
    showToast('Please enter both phone number and amount.', 'error');
    return;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_URL}/api/withdraw`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        userId,
        phoneNumber,
        network,
        amount: Number(amount)
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast(data.message || 'Withdrawal requested successfully!', 'success');
      user.balance = data.newBalance;
      localStorage.setItem('user', JSON.stringify(user));

      renderWallet();
      closeWithdrawModal();
    } else {
      showToast(data.message || 'Withdrawal failed.', 'error');
    }
  } catch (err) {
    console.error('Withdrawal error:', err);
    showToast('Error connecting to server.', 'error');
  }
}

// Expose Deposit / Withdraw functions globally
window.openDepositModal = openDepositModal;
window.closeDepositModal = closeDepositModal;
window.submitDeposit = submitDeposit;
window.openWithdrawModal = openWithdrawModal;
window.closeWithdrawModal = closeWithdrawModal;
window.submitWithdrawal = submitWithdrawal;

// ==========================================
// 7. UTILITIES & TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success', duration = 4000) {
  let container = document.getElementById('toast-container');

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

  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, duration);
}