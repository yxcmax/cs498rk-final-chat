"use strict";

require('./index')({
	uploadPath: __dirname + '/uploads',
	dbUrl: 'mongodb://localhost/message-server',
});
