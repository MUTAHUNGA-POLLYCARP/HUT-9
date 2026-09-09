const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  balance: {
    type: Number,
    default: 0,
    min: [0, 'Balance cannot be negative']
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  unlockedTiers: {
    type: [String],
    default: []
  },
  investments: [
    {
      machineName: { type: String },
      price: { type: Number },
      dailyProfit: { type: Number, default: 0 },
      startDate: { type: Date, default: Date.now },
      expiryDate: { type: Date },
      active: { type: Boolean, default: true }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);