const JanusPlugin = require('../JanusPlugin');

class VideoRoomSubscriber extends JanusPlugin {
  constructor (logger) {
    super(logger);
    this.pluginName = 'janus.plugin.videoroom';
  }

  initialize (peerConnection) {
    this.peerConnection = peerConnection;
  }

  joinRoomAndSubscribe (roomId, publisherId, roomPin = null, privatePublisherId = null,
      audio = true, video = true) {
    this.roomId = roomId;

    let join = {
      request: 'join',
      ptype: 'subscriber',
      feed: publisherId,
      room: roomId,
      offer_video: video,
      offer_audio: audio
    };

    if (roomPin) {
      join.pin = roomPin;
    }

    console.log("Joining room with ID", roomId);
    if (privatePublisherId) {
      console.log("\tprivatePublisherId:", privatePublisherId);
      join.private_id = privatePublisherId;
    }

    return this.transaction('message', { body: join }, 'event')
      .then((response) => {
        const { data, json } = response || {}
        if (!data || data.videoroom !== 'attached') {
          this.logger.error('VideoRoom join answer is not attached', data, json);
          throw new Error('VideoRoom join answer is not attached');
        }
        if (!json.jsep) {
          this.logger.error('VideoRoom join answer does not contains jsep', data, json);
          throw new Error('VideoRoom join answer does not contains jsep');
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
                    console.log('[sub] LocalDescription set', answer);
                    return this.startSubscriptionWithAnswer(answer);
                  });
              });
          });
      }).catch((error) => {
        this.logger.error('VideoRoom, unknown error connecting to room', error, join);
        throw error;
      });
  }

  startSubscriptionWithAnswer(jsep) {
    const body = { request: 'start', room: this.roomId };
    return this.transaction('message', { body, jsep }, 'event')
      .then((response) => {
        const { data, json } = response || {};

        if (!data || data.started !== 'ok') {
          this.logger.error('VideoRoom, could not start a stream', data, json);
          throw new Error('VideoRoom, could not start a stream');
        }

        return data;
      }).catch((error) => {
        this.logger.error('VideoRoom, unknown error sending answer', error, jsep);
        throw error;
      });
  }
}

module.exports = VideoRoomSubscriber;
