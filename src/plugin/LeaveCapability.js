const JanusPlugin = require('../JanusPlugin');

class LeaveCapability extends JanusPlugin {
  constructor (logger) {
    super(logger);
  }

  leaveRoom() {
    console.log("Leaving the room");

    const body = { request: 'leave' };

    return this.transaction('message', { body }, 'event')
      .then((response) => {
        console.log(response);
      });
  }
}

module.exports = LeaveCapability;