"use strict";

var mongoose = require('mongoose');
mongoose.connect('mongodb://nickproz:bearsrock@ds033897.mlab.com:33897/cs498rk1-final');

require('./index')({
	uploadPath: __dirname + '/uploads',
	port: 11111,
	mongoose: mongoose,
	dbconn: mongoose.connection
});
