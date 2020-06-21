const JanusPlugin = require('../JanusPlugin')
const SdpHelper = require('../SdpHelper')
const SdpUtils = require('sdp')

class VideoRoom extends JanusPlugin {
  constructor (logger, filterDirectCandidates = false) {
    super(logger);
    this.pluginName = 'janus.plugin.videoroom';

    this.filterDirectCandidates = !!filterDirectCandidates;

    this.roomId = undefined;
    this.memberId = undefined;
    this.privateMemberId = undefined;

    this.sdpHelper = new SdpHelper(this.logger);
    this.offerSdp = undefined;
    this.answerSdp = undefined;
  }

  detachPlugin () {
    super.hangup();

    this.janus.destroyPlugin(this).catch((error) => {
      this.logger.error('VideoRoom, destroyPlugin error', error);
      throw error;
    })
  }

  listRooms () {
    return this.transaction('message', { body: { request: 'list' } }, 'success').then((param) => {
      const { data } = param || {};
      if (!data || !Array.isArray(data.list)) {
        this.logger.error('VideoRoom, could not find rooms list', data);
        throw new Error('VideoRoom, could not find rooms list');
      }

      return data.list;
    }).catch((error) => {
      this.logger.error('VideoRoom, cannot list rooms', error);
      throw error;
    })
  }

  joinRoomAndPublish (roomId, displayName, offer, roomPin = null,
      relayAudio = true, relayVideo = true) {
    console.log(`Connecting to the room ${roomId}`);
    this.roomId = roomId;

    const body = {
      request: 'joinandconfigure',
      room: this.roomId,
      ptype: 'publisher',
      display: displayName,
      audio: relayAudio,
      video: relayVideo,
      data: false
    };

    if (roomPin) {
      body.pin = roomPin;
    }

    const jsep = offer;
    if (this.filterDirectCandidates && jsep.sdp) {
      jsep.sdp = this.sdpHelper.filterDirectCandidates(jsep.sdp);
    }
    this.offerSdp = jsep.sdp;

    return this.transaction('message', { body, jsep }, 'event')
      .then((response) => {
        console.log(response);

        const { data, json } = response || {};
        if (!data || !data.id || !data.private_id || !data.publishers) {
          this.logger.error('VideoRoom, could not join room', data);
          throw new Error('VideoRoom, could not join room');
        }
        if (!json.jsep) {
          throw new Error('Lacking JSEP field in response');
        }

        this.memberId = data.id;
        this.privateMemberId = data.private_id;

        const jsep = json.jsep;
        if (this.filterDirectCandidates && jsep.sdp) {
          jsep.sdp = this.sdpHelper.filterDirectCandidates(jsep.sdp);
        }
        this.answerSdp = jsep.sdp;

        return {
          publishers: data.publishers,
          offer: jsep
        };
      }).catch((error) => {
        this.logger.error('VideoRoom, error connecting to room', error);
        throw error;
      });
  }

  subscribeToFeed (memberId, roomPin = null, privateMemberId = null,
      audio = true, video = true) {
    return this.janus.addPlugin(new VideoRoom(console, this.filterDirectCandidates))
      .then((newRoomApi) => {
        return newRoomApi.joinRoomAndSubscribe(this.roomId, memberId, roomPin, privateMemberId)
          .then((offer) => {
            return { subscribeApi: newRoomApi, offer: offer };
          });
      });
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

        return jsep;
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

  submitCandidate (candidate) {
    if (this.filterDirectCandidates && candidate.candidate && this.sdpHelper.isDirectCandidate(candidate.candidate)) {
      return;
    }

    return this.transaction('trickle', { candidate });
  }

  onmessage (data, json) {
    // TODO data.videoroom === 'destroyed' handling
    // TODO unpublished === 'ok' handling : we are unpublished

    const { videoroom } = data || {};

    if (!data || !videoroom) {
      this.logger.error('VideoRoom got unknown message', json);
      return;
    }

    if (videoroom === 'slow_link') {
      this.logger.debug('VideoRoom got slow_link', data);
      this.slowLink();
      return;
    }

    if (videoroom === 'event') {
      const { room, joining, unpublished, leaving, publishers } = data;
      if (room !== this.roomId) {
        this.logger.error('VideoRoom got unknown roomId', this.roomId, json);
        return;
      }

      if (joining) {
        this.emit('remoteMemberJoined', joining);
      } else if (unpublished) {
        this.emit('remoteMemberUnpublished', unpublished);
      } else if (leaving) {
        this.emit('remoteMemberLeaving', leaving);
      } else if (Array.isArray(publishers)) {
        this.emit('publishersUpdated', publishers);
      } else {
        this.logger.error('VideoRoom got unknown event', json);
      }

      return;
    }

    this.logger.error('VideoRoom unhandled message:', videoroom, json);
  }
}

module.exports = VideoRoom
