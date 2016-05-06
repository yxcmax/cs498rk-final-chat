"use strict";

module.exports = function(mongoose, dbconn) {
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
		fileContent: Buffer,
		fileMimeType: String,
		timestamp: Date
	});

	MessageSchema.pre('save', function(next) {
		if (!this.timestamp) {
			this.timestamp = new Date();
		}
		next();
	});

	return dbconn.model('Message', MessageSchema);
};