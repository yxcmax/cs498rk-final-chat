"use strict";

var mongoose = require('mongoose');

var MessageSchema = new mongoose.Schema({
	sender: {
		type: String,
		required: [true, 'A sender is required!']
	},
	receiver: {
		type: String,
		required: [true, 'A receiver is required!']
	},
	messageType: {
		type: String,
		enum: ['text', 'image', 'file'],
		required: [true, 'A message type is required!'],
		default: 'text'
	},
	message: {
		type: String,
		trim: true
	},
	originalFilename: String,
	filePath: String,
	fileMimeType: String,
	timestamp: Date
});

MessageSchema.pre('save', function(next) {
	if (!this.timestamp) {
		this.timestamp = new Date();
	}
	next();
});

module.exports = mongoose.model('Message', MessageSchema);