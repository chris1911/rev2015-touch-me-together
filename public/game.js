
function quadGeometry(gl) {
	var attributes = new Float32Array([
		- 0.5, - 0.5, 
		  0.5, - 0.5,
		  0.5,   0.5,
		- 0.5,   0.5,
	]);
	
	var arrayBuffer = gl.createBuffer();
	
	gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, attributes, gl.STATIC_DRAW);
	
	return {
		array: arrayBuffer
	};
}

function game() {
	try {
		var container = document.getElementById('game');
		var canvas = document.createElement('canvas');
		var gl = this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
	} catch (err) {
		return console.error(err);
	}
	
	container.appendChild(canvas);

	var geometries = {
		quad: quadGeometry(gl),
	};
	
	generateTrackGeometry(gl);
	
	var programs = createPrograms(gl, {
		bg: ['fullscreen', 'bg'],
		touch: ['billboard', 'touch'],
		track: ['track', 'track'],
	});
	
	var cameraViewMatrix = mat4.create();
	var cameraProjectionMatrix = mat4.create();
	var cameraProjectionViewMatrix = mat4.create();
	var cameraAspect;
	var cameraFov = 1.2;
	var cameraPosition;

	var touchScale;

	function updateCameraProjectionMatrix() {
		if (cameraAspect > 1)
			mat4.perspective(cameraProjectionMatrix, cameraFov, cameraAspect, 1, 2000);
		else
			mat4.perspectiveX(cameraProjectionMatrix, cameraFov, cameraAspect, 1, 2000);
	}

	function onWindowResize(event) {
		var width = window.innerWidth;
		var height = window.innerHeight;
		cameraAspect = width / height;
		
		canvas.width = width;
		canvas.height = height;
		
		gl.viewport(0, 0, width, height);

		var touchRatio = 0.4;
		touchScale = (width > height ? [touchRatio / cameraAspect, touchRatio] : [touchRatio, touchRatio * cameraAspect]);

		return updateCameraProjectionMatrix();
	}
	
	window.addEventListener('resize', onWindowResize);
	onWindowResize();
	
	var inverseProjectionViewMatrix = new Float32Array(16);
	var mouse = vec2.create();
	function unprojectMouse(event) {
		var vec = vec4.fromValues(
			( (event.clientX - left) / width ) * 2 - 1,
			- ( (event.clientY - top) / height ) * 2 + 1,
			0,
			1
		);
		
		vec4.transformMat4(vec, vec, inverseProjectionViewMatrix);
		vec3.scale(vec, vec, 1 / vec[3]);
		
		vec3.subtract(vec, vec, cameraPosition);
		
		var distance = - cameraPosition[2] / vec[2];
		
		vec2.scaleAndAdd(mouse, cameraPosition, vec, distance);
	};
	
	song.notes.forEach(function(note) {
		note.alpha = new PFloat(1, PFloat.LINEAR, 4);
	});

	function resetNotes() {
		song.notes.forEach(function(note) {
			note.alpha.target = 1;
		});
	}

	var audioCtx;
	var audioBuffer;
	var audioStartTime;

	var pingTime;
	var serverHalfPing = 0;
	var pingTimeout;

	var socket;
	var isMaster = false;
	var isPlaying = false;

	var currentChunk, nextChunk;
	var fadeConstant = 0.2;
	var currentStage = 0;

	function toMusicalTime(t) {
		return t / 60 * map.bpm;
	}

	function fromMusicalTime(t) {
		return t * 60 / map.bpm;
	}

	function pushNextSource() {
		var gainNode = audioCtx.createGain();
		var sourceNode = audioCtx.createBufferSource();
		sourceNode.buffer = audioBuffer;
		sourceNode.connect(gainNode);
		gainNode.connect(audioCtx.destination);

		var offset = fromMusicalTime(map.stages[currentStage].from)
		var endTime = fromMusicalTime(map.stages[currentStage].to - map.stages[currentStage].from) + currentChunk.endTime
		gainNode.gain.setTargetAtTime(1.0, currentChunk.endTime, fadeConstant);
		sourceNode.start(currentChunk.endTime, offset);
		gainNode.gain.setTargetAtTime(0.0, endTime, fadeConstant);
		sourceNode.stop(endTime + 1);

		nextChunk = {
			gainNode: gainNode,
			sourceNode: sourceNode,
			endTime: endTime
		};
	}

	function discardNextSource() {
		nextChunk.sourceNode.disconnect();
		nextChunk.sourceNode.stop(audioCtx.currentTime);

		nextChunk.gainNode.disconnect();
		nextChunk.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
	}

	function send(args) {
		return socket.send(JSON.stringify(args));
	}

	function sendPing() {
		pingTime = Date.now();
		if (isPlaying)
			send(['ping', Math.floor((audioCtx.currentTime - audioStartTime) * 1000 - serverHalfPing)]);
		else
			send(['ping']);
	}
	
	function connect() {
		socket = new eio.Socket();

		socket.on('open', function() {
			if (location.hash)
				send(['auth', location.hash.substr(1)]);
			sendPing();
		});
		
		socket.on('message', function(message) {
			try {
				message = JSON.parse(message);
			} catch (err) {
				console.warn(message);
				return console.error(err);
			}
			
			if (message[0] !== 'pong' && message[0] !== 'y')
				console.log(message);
			
			switch (message[0]) {
				case 'master':
					if (!isMaster) {
						isMaster = true;

						audioCtx = new (window.AudioContext || window.webkitAudioContext)();

						var request = new XMLHttpRequest();
						request.open("GET", "/ponponpon.ogg", true);
						request.responseType = "arraybuffer";

						request.onload = function() {
							if (request.status >= 400) {
								return load(extensionIndex + 1);
							}
							
							audioCtx.decodeAudioData(request.response, function(buffer) {
								if (!buffer) {
									return console.error('Error while decoding');
								}
								
								audioBuffer = buffer;
								audioStartTime = audioCtx.currentTime;
								isPlaying = true;
								resetNotes();

								var gainNode = audioCtx.createGain();
								var sourceNode = audioCtx.createBufferSource();
								sourceNode.buffer = buffer;
								sourceNode.connect(gainNode);
								gainNode.connect(audioCtx.destination);

								var offset = fromMusicalTime(map.stages[0].from)
								var endTime = fromMusicalTime(map.stages[0].to - map.stages[0].from) + audioStartTime
								gainNode.gain.setTargetAtTime(1.0, audioCtx.currentTime, fadeConstant);
								sourceNode.start(audioCtx.currentTime, offset);
								gainNode.gain.setTargetAtTime(0.0, endTime, fadeConstant);
								sourceNode.stop(endTime + 1);

								currentChunk = {
									gainNode: gainNode,
									sourceNode: sourceNode,
									endTime: endTime
								};

								pushNextSource();
							}, function() {
								console.error('Error while decoding');
							});
						}

						request.onerror = function(err) {
							console.error(err);
						}

						request.send();
					}
					break;
					
				case 'pong':
					serverHalfPing = (Date.now() - pingTime) / 2000;
					pingTimeout = setTimeout(sendPing, 200);

					clientMusicalTime = masterMusicalTime;
					masterMusicalTime = toMusicalTime((message[1] - serverHalfPing) / 1000);
					clientRatio = 1;
					break;
					
				case 'stage':
					currentStage = message[1];
					break;

				default:
					console.log('unknown', message);
					break;
			}
		});
		
		socket.on('close', function() {
			clearTimeout(pingTimeout);
			pingTimeout = null;

			connect();
		});
	}

	connect();
	
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
	var startTime = Date.now();
	var lastTime = 0;
	var time;
	var dt;
	
	var musicalTime = 0;
	var masterMusicalTime = 0;
	var clientMusicalTime = 0;
	var clientRatio = 0;

	function animate(keyframes) {
		return evalKeyframe(keyframes, musicalTime);
	}

	function render() {
		requestAnimationFrame(render);
		
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		
		time = (Date.now() - startTime) / 1000;
		dt = time - lastTime;
		lastTime = time;

		if (isPlaying) {
			musicalTime = toMusicalTime(audioCtx.currentTime - audioStartTime);
			if (musicalTime >= map.stages[currentStage].to) {
				var duration = map.stages[currentStage].to - map.stages[currentStage].from;
				musicalTime -= duration;
				audioStartTime += fromMusicalTime(duration);
				currentChunk = nextChunk;
				pushNextSource();
				resetNotes();
			}
		}
		else {
			var dmt = toMusicalTime(dt);
			var duration = map.stages[currentStage].to - map.stages[currentStage].from;

			masterMusicalTime += dmt;
			if (masterMusicalTime >= map.stages[currentStage].to) {
				masterMusicalTime -= duration;
				resetNotes();
			}

			clientMusicalTime += dmt;
			if (clientMusicalTime >= map.stages[currentStage].to) {
				clientMusicalTime -= duration;
			}

			var diff = masterMusicalTime - clientMusicalTime;
			if (diff >= duration / 2)
				diff -= duration;
			if (diff < - duration / 2)
				diff += duration;

			if (Math.abs(diff) > 1)
				clientMusicalTime = masterMusicalTime;

			if (clientRatio > 0)
				clientRatio = Math.max(clientRatio - dt * 5, 0);

			musicalTime = clientMusicalTime * clientRatio + masterMusicalTime * (1 - clientRatio);
		}
		
		// console.log(musicalTime);

		cameraPosition = [
			animate(song.animations.cameraX),
			animate(song.animations.cameraY),
			animate(song.animations.cameraZ),
		]

		mat4.lookAtTilt(cameraViewMatrix, cameraPosition, [
			animate(song.animations.camTargetX),
			animate(song.animations.camTargetY),
			animate(song.animations.camTargetZ),
		], [0,0,1], -animate(song.animations.camTilt));

		mat4.multiply(cameraProjectionViewMatrix, cameraProjectionMatrix, cameraViewMatrix);
		mat4.invert(inverseProjectionViewMatrix, cameraProjectionViewMatrix);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, geometries.quad.array);
		
		gl.useProgram(programs.bg.id);
		gl.enableVertexAttribArray(programs.bg.position);
		gl.vertexAttribPointer(programs.bg.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniform3fv(programs.bg.cameraPosition, cameraPosition);
		gl.uniformMatrix4fv(programs.bg.viewMatrix, false, cameraViewMatrix);
		gl.uniformMatrix4fv(programs.bg.inverseProjectionViewMatrix, false, inverseProjectionViewMatrix);
		
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);


		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);

		gl.useProgram(programs.track.id);
		gl.uniformMatrix4fv(programs.track.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniform1f(programs.track.cameraAspect, cameraAspect);
		gl.uniform1f(programs.track.currentTime, musicalTime);
		
		var size = Float32Array.BYTES_PER_ELEMENT * 8;
		song.tracks.forEach(function(track) {
			gl.bindBuffer(gl.ARRAY_BUFFER, track.attributes);
			gl.enableVertexAttribArray(programs.track.position);
			gl.vertexAttribPointer(programs.track.position, 3, gl.FLOAT, false, size, 0);
			gl.enableVertexAttribArray(programs.track.direction);
			gl.vertexAttribPointer(programs.track.direction, 3, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 3);
			gl.enableVertexAttribArray(programs.track.halfThickness);
			gl.vertexAttribPointer(programs.track.halfThickness, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 6);
			gl.enableVertexAttribArray(programs.track.time);
			gl.vertexAttribPointer(programs.track.time, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 7);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, track.vertexCount);
			// gl.drawArrays(gl.LINE_STRIP, 0, track.vertexCount);
		})


		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, geometries.quad.array);
		
		gl.useProgram(programs.touch.id);
		gl.enableVertexAttribArray(programs.touch.position);
		gl.vertexAttribPointer(programs.touch.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniformMatrix4fv(programs.touch.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniform2fv(programs.touch.scale, touchScale);
		gl.uniform3fv(programs.touch.color, [1, 1, 0]);

		song.notes.forEach(function(note) {
			if (musicalTime >= note.time)
				note.alpha.target = 0;

			note.alpha.update(dt);

			gl.uniform3fv(programs.touch.center, note.position);
			gl.uniform1f(programs.touch.alpha, note.alpha.current);

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

		});
	}
	
	render();

	window.addEventListener('keydown', function(event) {
		if (isPlaying) {
			console.log(event.which);
			switch (event.which) {
				case 37: // left
					currentStage = Math.max(currentStage - 1, 0);
					break;

				case 39: // right
					discardNextSource();
					currentStage = Math.min(currentStage + 1, map.stages.length - 1);
					pushNextSource();
					send(['stage', currentStage]);
					break;
			}
		}
	}, true);
}

game();

// var color = document.getElementById("color");
// color.addEventListener("touchstart", function(event) {
// 	color.style.background = "green";
// }, false);
// color.addEventListener("touchend", function(event) {
// 	color.style.background = "red";
// }, false);
// color.addEventListener("touchmove", function(event) {
// }, false);