import { Contract } from 'trac-peer';

class TeamPresenceContract extends Contract {
  constructor(protocol, options = {}) {
    super(protocol, options);

    this.addSchema('setProfile', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        handle: { type: 'string', min: 1, max: 64 },
        timezone: { type: 'string', min: 1, max: 64 },
        hours_start: { type: 'string', min: 1, max: 16 },
        hours_end: { type: 'string', min: 1, max: 16 },
        teams: { type: 'array', items: 'string', optional: true, max: 16 },
      },
    });

    this.addSchema('setStatus', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        state: { type: 'string', min: 2, max: 16 },
        message: { type: 'string', optional: true, max: 256 },
        until: { type: 'number', optional: true },
        teams: { type: 'array', items: 'string', optional: true, max: 16 },
      },
    });

    this.addSchema('setRotations', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        team: { type: 'string', min: 1, max: 64 },
        rotations: {
          type: 'array',
          max: 64,
          items: {
            type: 'object',
            props: {
              from: { type: 'number' },
              to: { type: 'number' },
              primary: { type: 'string', min: 1, max: 128 },
              secondary: { type: 'string', optional: true, max: 128 },
            },
          },
        },
      },
    });

    this.addSchema('readTeam', {
      value: {
        $$strict: true,
        $$type: 'object',
        op: { type: 'string', min: 1, max: 64 },
        team: { type: 'string', min: 1, max: 64 },
      },
    });

    this.addSchema('feature_entry', {
      key: { type: 'string', min: 1, max: 256 },
      value: { type: 'any' },
    });

    this.addFunction('readMyPresence');
    this.addFunction('readTimer');
    this.addFunction('readChatLast');

    const _this = this;

    this.addFeature('timer_feature', async function () {
      if (false === _this.check.validateSchema('feature_entry', _this.op)) return;
      if (_this.op.key === 'currentTime') {
        const existing = await _this.get('currentTime');
        if (existing === null) console.log('timer started at', _this.op.value);
        await _this.put(_this.op.key, _this.op.value);
      }
    });

    this.messageHandler(async function () {
      if (_this.op?.type === 'msg' && typeof _this.op.msg === 'string') {
        const currentTime = await _this.get('currentTime');
        await _this.put('chat_last', {
          msg: _this.op.msg,
          address: _this.op.address ?? null,
          at: currentTime ?? null,
        });
      }
      console.log('message triggered contract', _this.op);
    });
  }

  async setProfile() {
    if (false === this.check.validateSchema('setProfile', this)) return;

    const allowedLen = 16;
    let teams = Array.isArray(this.value.teams) ? this.value.teams.slice(0, allowedLen) : [];
    teams = teams.map((t) => String(t).slice(0, 64));

    const currentTime = await this.get('currentTime');

    const profile = {
      handle: String(this.value.handle),
      timezone: String(this.value.timezone),
      hours_start: String(this.value.hours_start),
      hours_end: String(this.value.hours_end),
      teams,
      updatedAt: currentTime ?? null,
    };

    const cloned = this.protocol.safeClone(profile);
    this.assert(cloned !== null);

    const key = 'profile/' + this.address;
    await this.put(key, cloned);
  }

  async setStatus() {
    if (false === this.check.validateSchema('setStatus', this)) return;

    const state = String(this.value.state || '').toUpperCase();
    const allowedStates = ['ONLINE', 'AWAY', 'DND', 'OFFLINE', 'ON_CALL'];
    this.assert(allowedStates.includes(state), new Error('Invalid state'));

    let until = null;
    if (typeof this.value.until === 'number' && Number.isFinite(this.value.until)) {
      if (this.value.until > 0) {
        until = this.value.until;
      }
    }

    const maxTeams = 16;
    let teams = Array.isArray(this.value.teams) ? this.value.teams.slice(0, maxTeams) : [];
    teams = teams.map((t) => String(t).slice(0, 64));

    const currentTime = await this.get('currentTime');

    const status = {
      state,
      message: this.value.message ? String(this.value.message).slice(0, 256) : '',
      until,
      teams,
      updatedAt: currentTime ?? null,
    };

    const cloned = this.protocol.safeClone(status);
    this.assert(cloned !== null);

    const key = 'status/' + this.address;
    await this.put(key, cloned);
  }

  async setRotations() {
    if (false === this.check.validateSchema('setRotations', this)) return;

    const team = String(this.value.team || '').slice(0, 64);
    this.assert(team.length > 0, new Error('Team required'));

    const inputRotations = Array.isArray(this.value.rotations) ? this.value.rotations : [];

    const normalized = [];
    for (let i = 0; i < inputRotations.length; i += 1) {
      const entry = inputRotations[i];
      if (!entry) continue;
      const from = Number(entry.from);
      const to = Number(entry.to);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      if (to <= from) continue;
      const primary = String(entry.primary || '').slice(0, 128);
      if (!primary) continue;
      const secondary =
        typeof entry.secondary === 'string' && entry.secondary.length > 0
          ? String(entry.secondary).slice(0, 128)
          : null;
      normalized.push({
        from,
        to,
        primary,
        secondary,
      });
      if (normalized.length >= 64) break;
    }

    const currentTime = await this.get('currentTime');

    const payload = {
      team,
      rotations: normalized,
      updatedAt: currentTime ?? null,
    };

    const cloned = this.protocol.safeClone(payload);
    this.assert(cloned !== null);

    const key = 'rotation/' + team;
    await this.put(key, cloned);
  }

  async readMyPresence() {
    const profileKey = 'profile/' + this.address;
    const statusKey = 'status/' + this.address;

    const profile = await this.get(profileKey);
    const status = await this.get(statusKey);

    console.log('presence for', this.address, {
      profile: profile ?? null,
      status: status ?? null,
    });
  }

  async readTeam() {
    if (false === this.check.validateSchema('readTeam', this)) return;
    const team = String(this.value.team || '').slice(0, 64);
    if (!team) {
      console.log('readTeam: missing team');
      return;
    }
    const key = 'rotation/' + team;
    const rotation = await this.get(key);
    console.log('rotation for team', team, rotation ?? null);
  }

  async readTimer() {
    const currentTime = await this.get('currentTime');
    console.log('currentTime:', currentTime);
  }

  async readChatLast() {
    const last = await this.get('chat_last');
    console.log('chat_last:', last ?? null);
  }
}

export default TeamPresenceContract;
