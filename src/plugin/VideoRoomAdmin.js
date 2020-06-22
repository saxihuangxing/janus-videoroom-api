const JanusPlugin = require('../JanusPlugin');

class VideoRoomAdmin extends JanusPlugin {
  constructor (config, logger) {
    if (!config) {
      throw new Error('unknown config');
    }

    super(logger);
    this.pluginName = 'janus.plugin.videoroom';
    this.config = config;
  }

  createRoom (description, hidden = false, recording = false, pin = null, secret = null) {
    console.log("Creating new room:");
    console.log(`\tdescription=${description}`);
    console.log(`\thidden=${hidden}, recording=${recording}`);
    console.log(`\tpin=${pin}, secret=${secret}`);
    const body = {
      request: "create",
      description: description,
      record: recording,
      videocodec: this.config.codec,
      publishers: this.config.publishers,
      videoorient_ext: this.config.videoOrientExt
    };

    if (recording) {
      body.rec_dir = this.config.recordDirectory;
    }
    if (hidden) {
      body.is_private = hidden;
    }
    if (secret) {
      //password used for modifying/destroying the room
      body.secret = secret;
    }
    if (pin) {
      //password used for joining the room
      body.pin = pin;
    }

    if (this.config.bitrate) {
      body.bitrate = this.config.bitrate;
    }
    if (this.config.firSeconds) {
      body.fir_freq = this.config.firSeconds;
    }

    return this.transaction('message', { body }, 'success')
      .then((param) => {
        const { data } = param || {}
        if (!data || !data.room) {
          this.logger.error('VideoRoomJanusPlugin, could not create room', data);
          throw new Error('VideoRoomJanusPlugin, could not create room');
        }

        return data.room;
      }).catch((error) => {
        this.logger.error('VideoRoomJanusPlugin, could not create room', error);
        throw error;
      })
  }

  destroyRoom (id, secret = null) {
    console.log(`Destroying room ${id}`);
    const body = {
      request: "destroy",
      room: id,
      secret: secret
    };

    return this.transaction('message', { body }, 'success')
      .then((param) => {
        const { data } = param || {}
        if (!data || !data.room) {
          this.logger.error('VideoRoomJanusPlugin, could not destroy room', data);
          throw new Error('VideoRoomJanusPlugin, could not destroy room');
        }

        return data.room;
      }).catch((error) => {
        this.logger.error('VideoRoomJanusPlugin, could not destroy room', error);
        throw error;
      })
  }
}

module.exports = VideoRoomAdmin;
