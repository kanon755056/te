/*
 * This is Javascript demo code showing how to use the JSAPI.
 * It is common to both audio_only.html and audio_video.html.
 */

var grtcClient = null;
var grtcSession = null;
var localID = "";
var remoteID = "";
var remoteStatusMsg = "";
var conf = null;
var remoteViewFactor = 1;

// This may be set to true if a new media session is to be created on each O/A cycle.
// This is currently set to true for Firefox, which doesn't yet support renegotiation.
// However, this approach could be used with other browsers as well, if needed, to
// avoid some renegotiation issue.  Note, some RSMP configuration may be needed for this.
var newSessionOnNewOffer = false;

// This should be set to true if auto answering is to be used using "talk" event.
// You could alternatively comment out the code that adds the onIncomingCall handler,
// though it may be good to have this handler to inform the app of an incoming call.
// NOTE: This could be set using an option when creating the Grtc client.
var useTalkEvent = false;

// Media constraints used when making an offer, saved from grtc client constructor,
// and possibly overwritten by a call to testCall().  These are  also used on an
// INVITE message, requiring a new offer to be sent back.
// For accept call or answer, we always use 'true' for both audio and video.
// NOTE: These could be set using an option when creating the Grtc client.
var callAudioConstraints = true;
var callVideoConstraints = true;

// Object to store the last peer call statistics for future calculations.
var savedStats = null;

// The configuration object is used to construct Grtc.Client.
// These parameters are retrieved from user input in STEP2 of the
// web apps, so this function should be called right before constructing
// Grtc.Client. The default values of these parameters are set in the
// web apps (HTML files).
function getConfig() {
    conf = {
        'webrtc_gateway': $('#webrtc_gateway').val(),
        'stun_server': $('#stun_server').val(),
        'turn_server': $('#turn_server').val(),
        'turn_username': $('#turn_username').val(),
        'turn_password': $('#turn_password').val(),
        'sip_username': $('#sip_username').val(),
        'sip_password': $('#sip_password').val(),
        'dtls_srtp': $('#dtls_srtp').is(':checked'),
        'enable_ipv6': $('#enable_ipv6').is(':checked'),
        'noanswer_timeout': $('#noanswer_timeout').val(),
        'ice_timeout': $('#ice_timeout').val(),
        'ice_optimization': $('#ice_optimization').is(':checked'),
        'polling_timeout': $('#polling_timeout').val()
    };
}

// Checks if WebRTC is supported by the browser in use.
function check() {
    var rc = Grtc.isWebrtcSupported();
    if (rc) {
        // webrtc supported by browser
        $('#isWebrtcSupported-section').hide();
        $('#config-section').show();
    } else {
        // webrtc not supported by browser; warn the user
        alert("isWebrtcSupported: " + rc + ".\n" +
            "We recommend using the latest Chrome/Firefox/Opera browser.\n");
    }
}

// Handlers for onRemoteStream.  These two could be combined into one function.
// However, these demonstrate how multiple handlers could be used with the
// "stopOnFalse" option of the callback.  For e.g., a different handler could be
// added to a different call scenario, i.e., offer, answer, or invite.
function updateRemoteStatus(data) {
    // NOTE: when talk event is used, onNotifyEvent handler is used for this purpose.
    if (useTalkEvent === false) {
        $("#remoteStatus").empty();
        if (remoteID !== "") {      // A BYE could close session before we get here.
            $("#remoteStatus").append(remoteStatusMsg + " - established");
        }
    }
    return true;
}

function attachRemoteStream(data) {
    var element = document.getElementById("remoteView");
    if (element.getAttribute("src") === null) {
        console.log("Attaching remote stream");
    } else {
        console.log("Reattaching remote stream");
    }
    grtcClient.setViewFromStream(element, data.stream);
    return false;
}

function cleanupAfterCall() {
    savedStats = null;
    $("#remoteStatus").empty();
    remoteID = "";
    remoteStatusMsg = "";
}

// The main constructor function to create the grtc client, media session and the
// associated event handlers.
function testGrtcClientConstructor(audioConstraints, videoConstraints) {
    if (typeof audioConstraints !== "undefined") {
        callAudioConstraints = audioConstraints;
    }
    if (typeof videoConstraints !== "undefined") {
        callVideoConstraints = videoConstraints;
    }

    var mediaSelect = document.getElementById("mediaTypes").value;
    if (mediaSelect === 'AV')      { callAudioConstraints = true;   callVideoConstraints = true;  }
    else if (mediaSelect === 'AO') { callAudioConstraints = true;   callVideoConstraints = false; }
    else if (mediaSelect === 'VO') { callAudioConstraints = false;  callVideoConstraints = true;  }
    console.log("Media types to be used by default: audio=" + callAudioConstraints + "; video=" + callVideoConstraints);

    var autoAnswer = document.getElementById("autoAnswer").value;
    if (autoAnswer === 'false')    { useTalkEvent = false;  }
    else                           { useTalkEvent = true;   }
    console.log("Call Answer Method: " + (useTalkEvent ? "Auto (Talk Event)" : "Manual"));

    $('#config-section').hide();
    $('#main').show();

    // Construct a Grtc.Client instance that initially holds
    // a null gMediaSession reference.
    getConfig();
    console.log("Creating Grtc.Client with configuration: " + JSON.stringify(conf));
    grtcClient = new Grtc.Client(conf);

    newSessionOnNewOffer = Grtc.getWebrtcDetectedBrowser() === "firefox";
    // The following isn't needed for Firefox, as it is on in JSAPI by default for Firefox.
    //grtcClient.setRenewSessionOnNeed(newSessionOnNewOffer);
    grtcClient.setRenewSessionOnNeed(false);

    // Default log level in JSAPI is 2; use higher, up to 4, for verbose logging.
    //grtcClient.setLogLevel(4);

    // Set the media constraints to be used for creating offer or answer SDPs.
    // These may be necessary when JSAPI auto-responds with offer or answer SDPs
    // on session renegotiation or hold/talk events.
    grtcClient.setMediaConstraintsForOffer(callAudioConstraints, callVideoConstraints);
    grtcClient.setMediaConstraintsForAnswer(callAudioConstraints, callVideoConstraints);

    // Set max video bit rate (Kbps) (uses b=AS in SDP); the default in JSAPI is 500 Kbps.
    grtcClient.setVideoBandwidth(500);

    // Redefine grtcClient.filterIceCandidates() to discard candidates that may delay ICE.
    grtcClient.filterIceCandidates = function (Candidates) {
        outCandidates = [];
        var count = Candidates.length;
        for (var i = 0; i < count; i++) {
            var strCandidate = JSON.stringify(Candidates[i]);
            // Ignore private addresses, which aren't necessary and seem to add delay.
            // Also ignore tcp candidates that aren't used.
            if (strCandidate.match(/ 192\.168\.\d{1,3}\.\d{1,3} \d+ typ host/i) === null &&
                strCandidate.match(/ tcp \d+/i) === null) {
                outCandidates.push(Candidates[i]);
            }
        }
        return outCandidates;
    };

    // Create a MediaSession instance to make or accept calls.
    // It's possible to reuse the same session instance for multiple calls, though a
    // new instance can be created for every call (as it used to be).
    grtcSession = new Grtc.MediaSession(grtcClient);
    grtcSession.onRemoteStream.add(updateRemoteStatus);
    grtcSession.onRemoteStream.add(attachRemoteStream);

    // Register a handler to deal with an incoming call, with or without SDP offer.
    // This will simply accept or reject the call.  NOTE: This handler may not need
    // to be defined, if the call is going to be auto-answered on NOTIFY talk events.
    // NOTE: This handler is not invoked any more on session renegotiation.
    grtcClient.onIncomingCall.add(function (data) {
        var doAccept = true;
        try {
            // Ask user to confirm whether to accept or reject call, unless "talk"
            // event is to be used.
            var user_said = useTalkEvent ? true : window.confirm(
                "Do you want to accept a call from " + data.peer + "?");
            if (user_said === true) {
                remoteID = data.peer;
                $("#remoteStatus").empty();
                remoteStatusMsg = "Call from " + remoteID;
                $("#remoteStatus").append(remoteStatusMsg);
            } else {
                doAccept = false;
            }
            // We could create a new MediaSession for every call, or reuse one created earlier.
            /*if (grtcSession === null) {
                try {
                    // Create a MediaSession instance and accept/reject call.
                    grtcSession = new Grtc.MediaSession(grtcClient);
                    grtcSession.onRemoteStream.add(updateRemoteStatus);
                    grtcSession.onRemoteStream.add(attachRemoteStream);
                } catch (e) {
                    alert("Could not create Grtc.MediaSession for incoming call.");
                    return false;
                }
            } */
        } catch (e) {
            alert("Could not accept call from " + data.peer);
            return false;
        }
        if (useTalkEvent) { return false; }
        if (doAccept) {
            //grtcSession.acceptCall(true, true, remoteID);
            grtcSession.acceptCall(callAudioConstraints, callVideoConstraints, remoteID);
        } else {
            grtcSession.rejectCall();
            //grtcSession = null;   // Don't set to null to reuse the session for future calls
        }
        return false;
    });

    // NOTE: This event is experimental, and not officially supported!
    grtcClient.onCallEvent.add(function (data) {
        console.log("Call event: " + data.event);
        return false;
    });

    // Invoked on a NOTIFY Event, talk or hold.  It could be used for informing the user
    // of call status, and/or getting the remoteID when onIncomingCall is not used.
    grtcClient.onNotifyEvent.add(function (data) {
        console.log("Notify event received: " + data.event);
        if (remoteID === "") {
            remoteID = data.peer;
            remoteStatusMsg = "Call from " + remoteID;
        }
        $("#remoteStatus").empty();
        if (data.event === "talk") {
            $("#remoteStatus").append(remoteStatusMsg + " - established");
        }
        else if (data.event === "hold") {
            $("#remoteStatus").append(remoteStatusMsg + " - on-hold");
        }
        return false;
    });

    // Invoked when info data arrives from the peer.
    grtcClient.onInfoFromPeer.add(function (data) {
        alert("Got data from peer:\n" + JSON.stringify(data));
        return false;
    });

    // Invoked when call statistics arrives from the WebRTC Server.
    grtcClient.onStatsFromServer.add(function (stats) {
        //console.log("Got call statistics from peer:\n" + JSON.stringify(stats));
        if (typeof stats.audio === 'object') {
            console.log("Round-Trip Times (RTT) for audio RTCP: latest " + stats.audio.rtt +
                ", max " + stats.audio.rtt_max + ", average " + stats.audio.rtt_average);
            var aRxStats = stats.audio.rx;
            var lostRatio = (aRxStats.lost * 100)/(aRxStats.lost + aRxStats.packets);
            if (aRxStats.jitter > 100 || lostRatio > 1) {
                console.log("Audio quality may be low - jitter " + aRxStats.jitter +
                    ", lost " + aRxStats.lost + " (" + lostRatio.toFixed(2) + "%)");
            }
            if (savedStats) {
                var audioBR = ((aRxStats.bytes - savedStats.audio.rx.bytes) * 8)/
                              (stats.timestamp - savedStats.timestamp);
                console.log("Audio bit-rate " + audioBR.toFixed(3) + " kbits/sec");
            }
        }
        if (typeof stats.video === 'object') {
            // NOTE: rtt values for video may be unavailable (0), or possibly incorrect,
            // due to frequent RTCP feedback messages.
            var vRxStats = stats.video.rx;
            var lostRatio = (vRxStats.lost * 100)/(vRxStats.lost + vRxStats.packets);
            if (vRxStats.jitter > 500 || lostRatio > 2) {
                console.log("Video quality may be low - jitter " + vRxStats.jitter +
                    ", lost " + vRxStats.lost + " (" + lostRatio.toFixed(2) + "%)");
            }
            if (savedStats && savedStats.video) {
                var videoBR;
                if (vRxStats.bytes > 0) {
                    videoBR = (vRxStats.bytes - savedStats.video.rx.bytes);
                }
                else {  // It's likely sendonly for WebRTC GW (and recvonly for browser)
                    videoBR = (stats.video.tx.bytes - savedStats.video.tx.bytes);
                }
                videoBR = (videoBR * 8)/(stats.timestamp - savedStats.timestamp);
                console.log("Video bit-rate " + videoBR.toFixed(3) + " kbits/sec");
            }
        }
        var aDate = new Date();
        var latency = aDate.getTime() - stats.timestamp;
        console.log("Message latency " + latency +
            " ms (system clock should be in sync with the server for this to be correct)");
        console.log("Call duration " + (stats.duration/1000).toFixed(3) + " Secs");
        if (remoteID.length > 0) {  // Note: this could happen after call is hung up.
            savedStats = stats;
        }
        return false;
    });

    // Invoked on connection hanging get error, usually when gateway goes down.
    // The app may retry sign-in in the HA case, or at least, warn the user.
    grtcClient.onConnectionError.add(function (obj) {
        if (grtcSession) {
            alert("Got connection error: " + JSON.stringify(obj));
            testDisconnect();
        }
        return false;
    });

    // Invoked on WebRTC Gateway error, which may be irrecoverable.
    // The app may want to end the session, or ignore the error.
    grtcClient.onGatewayError.add(function (obj) {
        alert("Got gateway error: " + JSON.stringify(obj));
        //grtcSession.closeSession(true);
        return false;
    });

    // Invoked on WebRTC browser API error, which could be recoverable.
    // The app may want to ignore this error, log it, and/or inform the user.
    grtcClient.onWebrtcError.add(function (obj) {
        alert("Got WebRTC error: " + JSON.stringify(obj));
        return false;
    });

    // When the peer closes, this event is fired; do the necessary clean-up here.
    grtcClient.onPeerClosing.add(function () {
        if (grtcSession) {
            //grtcSession = null;
        }
        console.log("Call with " + remoteID + " has ended");
        cleanupAfterCall();
        return false;
    });

    // Fired on no-answer timeout after making an initial or updated offer to peer.
    grtcClient.onPeerNoanswer.add(function () {
        if (grtcSession) {
            grtcSession.closeSession(true);
            //grtcSession = null;
        }
        cleanupAfterCall();
        return false;
    });

    grtcClient.onMediaSuccess.add(function (obj) {
        document.getElementById("localView").style.opacity = 1;
        grtcClient.setViewFromStream(document.getElementById("localView"), obj.stream);
        return false;
    });

    grtcClient.onMediaFailure.add(function (obj) {
        alert(obj.message);
        return false;
    });

    function handleOnConnect(e) {
        $("#localStatus").empty();
        $("#localStatus").append("Registered anonymously");
        return false;
    }

    function handleOnRegister(e) {
        $("#localStatus").empty();
        $("#localStatus").append("Registered as " + localID);
        return false;
    }

    function handleOnConnectFailed(e) {
        alert(e.message);
        localID = "";
        return false;
    }

    grtcClient.onConnect.add(handleOnConnect);
    grtcClient.onRegister.add(handleOnRegister);
    grtcClient.onFailed.add(handleOnConnectFailed);

    window.onbeforeunload = function() {
        grtcClient.disconnect();
    };

    createDialingPad();
}

// This calls JSAPI to obtain a local media stream.
function testEnableMediaSource(audioConstraints, videoConstraints) {
    // calls Grtc.Client.enableMediaSource
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else {
        // enable audio and/or video
        grtcClient.enableMediaSource(audioConstraints, videoConstraints);
    }
}

// This enables local media sources, based on the selection in the app.
function setMediaSources() {
    //if (!grtcClient) { alert("Grtc.Client instance not created"); return }
    var mediaSelect = document.getElementById("mediaSources").value;
    if (mediaSelect === 'AV') {
        testEnableMediaSource(true, Grtc.VideoConstraints.qvga());
    } else if (mediaSelect === 'AO') {
        testEnableMediaSource(true, false);
    } else if (mediaSelect === 'VO') {
        testEnableMediaSource(false, Grtc.VideoConstraints.qvga());
    } else if (mediaSelect === 'SS') {
        testEnableMediaSource(false, Grtc.VideoConstraints.screen(960, 720) );
    }
}

// This calls JSAPI to release the local media stream that was obtained earlier.
function testDisableMediaSource() {
    // calls Grtc.Client.disableMediaSource
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else {
        grtcClient.disableMediaSource();
        document.getElementById("localView").src = "";
    }
}

// This calls connect method of JSAPI to register with the gateway anonymously.
function testConnect() {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else {
        localID = "anonymous";
        grtcClient.connect();
    }
}

// This calls register method of JSAPI to register with the gateway and SIP Server.
function testRegister() {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else {
        var registerID = document.getElementById("registerInput");
        if (registerID.value.match(/Anon/) !== null) {
            localID = "Anonymous";
            grtcClient.connect();   // Connect anonymously
            console.log('you call connect----------------')
        }
        else {                      // Get the selected DN, and register
            localID = registerID.value.toLowerCase();
            if (localID.length === 0) {
                alert("Please select an ID from the drop-down list");
                registerID.focus();
            } else {
                grtcClient.register(localID);
            }
        }
    }
}

/* testUnregister() isn't used now; testDisconnect() is used instead.
function handleOnDisconnect() {
    $("#localStatus").empty();
    $("#remoteStatus").empty();
}

function testUnregister() {
    // calls Grtc.Client.disconnect
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else {
        grtcClient.onDisconnect.add(handleOnDisconnect);
        grtcClient.disconnect();
    }
} */

// Unregister/sign-out from WebRTC gateway.
function testDisconnect() {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else {
        grtcClient.disconnect();
        $("#localStatus").empty();
        cleanupAfterCall();
        //grtcSession = null;
        localID = "";
    }
}

// Accept or answer an incoming call manually.
function testAcceptCall() {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else if (grtcSession === null) {
        alert("Grtc.MediaSession instance is not created");
    }
    else {
        grtcSession.acceptCall(callAudioConstraints, callVideoConstraints);
    }
}

// Make a new call (with offer), or a new offer to peer to update an existing call.
function testCall(audioConstraints, videoConstraints, holdCall) {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else {
        if (localID.length === 0) {
            alert("Please register first");
            return;
        }
        var remoteDNSelect = document.getElementById("remoteDNInput");
        if (remoteDNSelect.value.length > 0) {
            remoteID = remoteDNSelect.value.toLowerCase();
        }
        // Else, we would use remoteID, given it's already set from existing call.
        if (remoteID.length === 0) {
            alert("Please select an ID from the drop-down list");
            remoteDNSelect.focus();
        } else {
            // We could create a new MediaSession for every call, or reuse one created earlier.
            /* if (grtcSession === null) {
                $("#remoteStatus").empty();
                remoteStatusMsg = "Call to " + remoteID;
                $("#remoteStatus").append(remoteStatusMsg);
                grtcSession = new Grtc.MediaSession(grtcClient);
                grtcSession.onRemoteStream.add(updateRemoteStatus);
                grtcSession.onRemoteStream.add(attachRemoteStream);
            }  else */
            {
                $("#remoteStatus").empty();
                remoteStatusMsg = "Call to " + remoteID;
                $("#remoteStatus").append(remoteStatusMsg);
            }
            if (typeof audioConstraints !== "undefined") {
                callAudioConstraints = audioConstraints;
            }
            if (typeof videoConstraints !== "undefined") {
                callVideoConstraints = videoConstraints;
            }
            grtcSession.makeOffer(remoteID, audioConstraints, videoConstraints, holdCall);
        }
    }
}

// Make a call or offer using media constraints based on the app selection.
function testSelectAndCall() {
    var receiveSelect = document.getElementById("mediaReceived").value;
    if (receiveSelect === 'AV') {
        testCall(true, true);
    } else if (receiveSelect === 'AO') {
        testCall(true, false);
    } else if (receiveSelect === 'VO') {
        testCall(false, true);
    }
}

// Hang up the call.  Note, onPeerClosing handler won't be called in this case.
function testHangUp() {
    if (grtcSession) {
        grtcSession.terminateCall();
        //grtcSession = null;
    }
    cleanupAfterCall();
}

// Update current call - used to mute/unmute the call.
function testUpdateCall(audioConstraints, videoConstraints) {
   if (grtcSession) {
       grtcSession.updateCall(audioConstraints, videoConstraints);
   }
   else {
        alert("Media session or call does not exist");
   }
}

// Put an active call on-hold.
function testHoldCall() {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else if (!grtcSession || remoteID.length === 0 ) {
        alert("Media session or call does not exist");
    }
    else {
        grtcSession.holdCall();
    }
}

// Resume a call that has been put on-hold.
function testResumeCall() {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else if (!grtcSession || remoteID.length === 0 ) {
        alert("Media session or call does not exist");
    }
    else {
        grtcSession.resumeCall();
    }
}

// Send info data to peer.
// Example data format: name1=val1&name2=val2
function testSendData() {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else if (!grtcSession) {
        alert("Media session or call does not exist");
    } else {
        var queryStr = document.getElementById("PeerData").value;
        var obj = Grtc.deparam(queryStr);
        if ($.isEmptyObject(obj)) {
            alert("Empty or invalid input data");
        }
        else {
            grtcSession.sendInfo(obj, false);
        }
    }
}

function testGetStats() {
    if (!grtcClient) { alert("Grtc.Client instance not created"); }
    else if (!grtcSession) {
        alert("Media session or call does not exist");
    } else {
        grtcSession.getServerStats();
    }
}

// Send DTMF tones to peer. Only works for Chrome now.
function sendTone(tones) {
  if (!grtcClient) { alert("Grtc.Client instance not created"); return; }
  var options = {"duration": 500, "tonegap": 50};
  console.log("DTMF send result: [" + grtcSession.sendDTMF(tones, options) + "]");
}

// Create a phone like dialing pad for sending DTMF to peer.
function createDialingPad() {
  var tones = '1234567890*#ABCD';
  var dialingPad = document.getElementById('dialingPad');
  for (var i = 0; i < tones.length; ++i) {
    var tone = tones.charAt(i);
    dialingPad.innerHTML += '<button id="' +
      tone + '" onclick="sendTone(\'' + tone +
      '\')" style="height:40px; width: 30px">' + tone + '</button>';
    if ((i + 1) % 4 == 0) {
      dialingPad.innerHTML += '<br>';
    }
  }
}

// Toggles the RemoteView size by doubling it 3 times, and then back to original size.
function toggleRemoteViewSize() {
    if (remoteViewFactor === 4) {
        remoteViewFactor = 1;
    } else {
        remoteViewFactor++;
    }
    remElement = document.getElementById("remoteView");
    //remElement.style.height = 240*(remoteViewFactor < 4 ? remoteViewFactor : 3);
    remElement.height = 240*remoteViewFactor;
    remElement.width  = 320*remoteViewFactor;
    if (typeof remElement.mozSrcObject !== 'undefined') {
        // Firefox is the browser, which needs this.
        remElement.play();
    }
}
