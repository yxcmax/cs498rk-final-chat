var chatProvider = angular.module('ggsChat', []);

chatProvider.provider('ggsChat', function() {
	var serverUrl;
	var socket;
	this.init = function(url) {
		if (socket == undefined) {
			serverUrl = url.replace(/\/+$/, '');
			socket = io(url);
		}
	};
	this.$get = ['$http', '$timeout', function($http, $timeout) {
		var apiBase = serverUrl + '/load_message'
		var messageLoaded = false;
		var messageQueue = [];
		var messageCallback;
		var reloadCallback;
		var user;
		var room;
		function emptyQueue(cb) {
			for (var i = 0; i < messageQueue.length; i++) {
				cb(messageQueue[i]);
			}
			messageQueue.splice(0);
		}
		function loadMessages() {
			messageQueue = [];
			messageLoaded = false;
			$http.post(apiBase, {
				roomId: room
			}).success(function(res) {
				messageLoaded = true;
				messageQueue = res.concat(messageQueue);
				emptyQueue(messageCallback);
			}).error(function(res) {
				console.log('Error getting previous messages!');
				console.log(res);
			});
		}
		function joinImpl() {
			if (user !== undefined && room !== undefined) {
				reloadCallback();
				socket.send({
					username: user,
					roomId: room
				});
			}
		}
		socket.on('connect', joinImpl);
		// socket.on('reconnect', joinImp);
		socket.on('message', function(msg) {
			if (msg.status == "OK") {
				room = msg.roomId;
				console.log('successfully joined ' + room);
				loadMessages();
			} else {
				console.log('failed to join!!!');
			}
		});
		socket.on('chatMessage', function(msg) {
			if (!messageLoaded) {
				messageQueue.push(msg);
			} else {
				messageCallback(msg);
			}
		});
		socket.on('roomParticipants', function(msg) {
			console.log(msg);
		});
		return {
			/**
			 *	Use this to join a room.
			 *	@username name of the user
			 *	@roomId id of the room to join
			 *	@onNewMessage callback that gets fired when new messages arrive
			 *	@onReload callback that gets fired when all messages should be cleared
			 */
			joinRoom: function(username, roomId, onNewMessage, onReload) {
				user = username;
				room = roomId;
				messageCallback = function(msg) {
					$timeout(function() {onNewMessage(msg);});
				};
				reloadCallback = onReload;
				if (socket.connected) {
					joinImpl();
				}
			},
			sendMessage: function(msg) {
				socket.emit('postMessage', {message: msg});
			}
		};
	}];
});