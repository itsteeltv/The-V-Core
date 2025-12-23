// twitch-api.js
const TwitchAPI = {
    config: {
        id: '00b8gxihwie71gneokv87snoi0fbqe',
        secret: 'rpy4mumxeic8ujmrbewf7ji5yxb9gk',
        cacheKey: 'vcore_finder_cache',
        timeKey: 'vcore_finder_timestamp',
        duration: 120000 // 2 minutes
    },

    async getToken() {
        const cached = localStorage.getItem('twitch_access_token');
        const expiry = localStorage.getItem('twitch_token_expiry');
        if (cached && expiry && Date.now() < parseInt(expiry)) return cached;

        const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${this.config.id}&client_secret=${this.config.secret}&grant_type=client_credentials`, { method: 'POST' });
        const data = await res.json();
        localStorage.setItem('twitch_access_token', data.access_token);
        localStorage.setItem('twitch_token_expiry', (Date.now() + (data.expires_in * 1000)).toString());
        return data.access_token;
    },

    async getVTubers(forceRefresh = false) {
        // 1. Vérifier le cache
        const cached = localStorage.getItem(this.config.cacheKey);
        const time = localStorage.getItem(this.config.timeKey);
        if (!forceRefresh && cached && time && (Date.now() - time < this.config.duration)) {
            return JSON.parse(cached);
        }

        // 2. Sinon, fetch les données
        const token = await this.getToken();
        let allVTubers = [];
        let cursor = "";

        for (let i = 0; i < 11; i++) {
            const res = await fetch(`https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}`, {
                headers: { 'Client-ID': this.config.id, 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (!result.data) break;

            const matches = result.data.filter(s => s.tags?.some(t => t.toLowerCase().includes('vtuber')));
            allVTubers = [...allVTubers, ...matches];
            cursor = result.pagination.cursor;
            if (!cursor) break;
        }

        // 3. Enrichir avec les PFPs (Profil Pictures)
        allVTubers = await this._enrichWithProfiles(allVTubers, token);

        // 4. Sauvegarder
        localStorage.setItem(this.config.cacheKey, JSON.stringify(allVTubers));
        localStorage.setItem(this.config.timeKey, Date.now().toString());
        return allVTubers;
    },

    async _enrichWithProfiles(streams, token) {
        if (streams.length === 0) return [];
        // Twitch limite à 100 users par requête
        const logins = streams.map(s => `login=${s.user_login}`).join('&');
        const res = await fetch(`https://api.twitch.tv/helix/users?${logins}`, {
            headers: { 'Client-ID': this.config.id, 'Authorization': `Bearer ${token}` }
        });
        const userData = await res.json();
        
        return streams.map(s => ({
            ...s,
            profile_image_url: userData.data.find(u => u.id === s.user_id)?.profile_image_url || ""
        }));
    }
};