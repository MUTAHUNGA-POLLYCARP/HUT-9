const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  balance: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    default: 'user' // 'user' or 'admin'
  },
  investments: [
    {
      machineName: String,
      price: Number,
      dailyProfit: Number,
      startDate: Date,
      expiryDate: Date,
      active: Boolean
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);