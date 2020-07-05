const JanusPlugin = require('../JanusPlugin');

class VideoRoomSubscriber extends JanusPlugin {
  constructor (logger) {
    super(logger);
    this.pluginName = "janus.plugin.videoroom";
  }

  initialize (peerConnection) {
    this.peerConnection = peerConnection;
  }

  joinRoomAndSubscribe (roomId, publisherId, roomPin = null, privatePublisherId = null,
      audio = true, video = true, data = true) {
    console.log(`Subscribing to member ${publisherId} in room ${roomId}`);

    this.roomId = roomId;
    this.roomPin = roomPin;
    this.publisherId = publisherId;
    this.privatePublisherId = privatePublisherId;
    this.audio = audio;
    this.video = video;

    let join = {
      request: "join",
      ptype: "subscriber",
      feed: publisherId,
      room: roomId,
      audio: audio,
      video: video,
      data: data,
      offer_video: video,
      offer_audio: audio,
      offer_data: data
    };
    if (roomPin) {
      join.pin = roomPin;
    }
    if (privatePublisherId) {
      join.private_id = privatePublisherId;
    }

    return this.transaction("message", { body: join }, "event")
      .then((response) => {
        const { data, json } = response || {};

        if (!data || data.videoroom !== "attached") {
          this.logger.error("VideoRoom join answer is not \"attached\"", data, json);
          throw new Error("VideoRoom join answer is not \"attached\"");
        }
        if (!json.jsep) {
          this.logger.error("VideoRoom join answer does not contains jsep", data, json);
          throw new Error("VideoRoom join answer does not contains jsep");
        }

        const jsep = json.jsep;
        if (this.filterDirectCandidates && jsep.sdp) {
          jsep.sdp = this.sdpHelper.filterDirectCandidates(jsep.sdp);
        }

        return this.peerConnection.setRemoteDescription(jsep)
          .then(() => {
            console.log("[sub] RemoteDescription set", jsep);
            return this.peerConnection.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
              .then((answer) => {
                return this.peerConnection.setLocalDescription(answer)
                  .then(() => {
                    console.log("[sub] LocalDescription set", answer);

                    const jsep = answer;
                    const body = { request: 'start', room: this.roomId };
                    return this.transaction('message', { body, jsep }, 'event')
                      .then((response) => {
                        const { data, json } = response || {};

                        if (!data || data.started !== 'ok') {
                          this.logger.error('VideoRoom, could not start a stream', data, json);
                          throw new Error('VideoRoom, could not start a stream');
                        }

                        this.audioOn = audio;
                        this.videoOn = video;
                        return data;
                      }).catch((error) => {
                        this.logger.error('VideoRoom, unknown error sending answer', error, jsep);
                        throw error;
                      });
                  });
              });
          });
      }).catch((error) => {
        this.logger.error('VideoRoom, unknown error connecting to room', error, join);
        throw error;
      });
  }

  modifySubscription (audio = true, video = true, data = true) {
    console.log(`Modifying subscription to member ${this.publisherId} in room ${this.roomId}`);

    let configure = {
      request: 'configure',
      ptype: 'subscriber',
      feed: this.publisherId,
      room: this.roomId,
      video: video,
      audio: audio,
      data: data,
      offer_video: video,
      offer_audio: audio,
      offer_data: data
    };
    if (this.roomPin) {
      configure.pin = this.roomPin;
    }
    if (this.privatePublisherId) {
      configure.private_id = this.privatePublisherId;
    }

    return this.transaction("message", { body: configure }, "event")
      .then((response) => {
        const { data, json } = response || {};

        if (!data || data.configured !== "ok") {
          this.logger.error("VideoRoom configure answer is not \"ok\"", data, json);
          throw new Error("VideoRoom configure answer is not \"ok\"");
        }
        console.log("Subscription modified", response);

        this.audioOn = audio;
        this.videoOn = video;
      }).catch((error) => {
        this.logger.error("VideoRoom, unknown error modifying subscription", error, configure);
        throw error;
      });
  }

  stopAudio () {
    if (this.audioOn) {
      console.log(`Stopping audio of publisher ${this.publisherId}`);
      return this.modifySubscription(false, this.videoOn);
    } else {
      console.log(`Audio of publisher ${this.publisherId} is already turned off`);
    }
  }

  startAudio () {
    if (!this.audioOn) {
      console.log(`Starting audio of publisher ${this.publisherId}`);
      return this.modifySubscription(true, this.videoOn);
    } else {
      console.log(`Audio of publisher ${this.publisherId} is already turned on`);
    }
  }

  stopVideo () {
    if (this.videoOn) {
      console.log(`Stopping video of publisher ${this.publisherId}`);
      return this.modifySubscription(this.audioOn, false);
    } else {
      console.log(`Video of publisher ${this.publisherId} is already turned off`);
    }
  }

  startVideo () {
    if (!this.videoOn) {
      console.log(`Starting video of publisher ${this.publisherId}`);
      return this.modifySubscription(this.audioOn, true);
    } else {
      console.log(`Video of publisher ${this.publisherId} is already turned on`);
    }
  }
}

module.exports = VideoRoomSubscriber;
