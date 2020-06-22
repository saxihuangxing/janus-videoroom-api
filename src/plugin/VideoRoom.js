const adapter = require('webrtc-adapter');

const VideoRoomPublisher = require('./VideoRoomPublisher');
const VideoRoomSubscriber = require('./VideoRoomSubscriber');

const JanusPlugin = require('../JanusPlugin');
const SdpHelper = require('../SdpHelper');

class VideoRoom extends JanusPlugin {
  constructor (logger, iceConfig, filterDirectCandidates) {
    super(logger);
    this.pluginName = 'janus.plugin.videoroom';

    this.iceConfig = iceConfig;
    this.filterDirectCandidates = !!filterDirectCandidates;

    this.sdpHelper = new SdpHelper(this.logger);
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

  //todo: list participants

  createPublisher () {
    return this.janus.addPlugin(new VideoRoomPublisher(this.logger))
      .then((publisher) => {
        publisher.initialize(this.createPeerConnection(publisher));
        return publisher;
      });
  }

  createSubscriber () {
    return this.janus.addPlugin(new VideoRoomSubscriber(this.logger))
      .then((subscriber) => {
        subscriber.initialize(this.createPeerConnection(subscriber));
        return subscriber;
      });
  }

  createPeerConnection (plugin) {
    const peerConnection = new RTCPeerConnection(this.iceConfig);
    peerConnection.onicecandidate = this.onIceCandidate(plugin);
    return peerConnection;
  }

  submitCandidate (plugin, candidate) {
    if (this.filterDirectCandidates && candidate.candidate &&
      this.sdpHelper.isDirectCandidate(candidate.candidate)) {
      return;
    }

    return plugin.transaction('trickle', { candidate });
  }

  onIceCandidate(plugin) {
    return (event) => {
      if (!event.candidate || !event.candidate.candidate) {
        this.submitCandidate(plugin, {completed: true});
      } else {
        const candidate = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        }
        this.submitCandidate(plugin, candidate);
      }
    };
  }
}

module.exports = VideoRoom;
