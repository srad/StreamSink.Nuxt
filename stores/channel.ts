import type { DatabaseChannel, RequestsChannelRequest as ChannelRequest } from '@/services/api/v1/StreamSinkClient';
import type { ServicesChannelInfo as ChannelInfo } from '@/services/api/v1/StreamSinkClient';

import { defineStore } from 'pinia';
import { useJobStore } from '#imports';
import { useNuxtApp } from '#app/nuxt';

export interface ChannelState {
  channels: ChannelInfo[];
}

export const useChannelStore = defineStore('channel', {
  persist: true,
  state: (): ChannelState => ({
    channels: [],
  }),
  actions: {
    save(channel: ChannelRequest) {
      return new Promise((resolve, reject) => {
        const { $client } = useNuxtApp();
        $client.channels.channelsCreate(channel)
          .then(res => {
            this.add(res.data);
            resolve(res.data);
          })
          .catch(res => reject(res.error));
      });
    },
    online(channelId: number) {
      const i = this.channels.findIndex(ch => ch.channelId === channelId);
      if (i !== -1) {
        this.channels[i].isOnline = true;
      }
    },
    offline(channelId: number) {
      const i = this.channels.findIndex(ch => ch.channelId === channelId);
      if (i !== -1) {
        this.channels[i].isOnline = false;
        this.channels[i].isRecording = false;
      }
    },
    thumbnail(channelId: number) {
      const index = this.channels.findIndex(ch => ch.channelId === channelId);
      if (index !== -1) {
        // Refresh cache with url timestamp update.
        this.channels[index].preview = this.channels[index].preview.split('?')[0] + `?time=${new Date().toISOString()}`;
      }
    },
    start(channelId: number) {
      const i = this.channels.findIndex(ch => ch.channelId === channelId);
      if (i !== -1) {
        this.channels[i].isRecording = true;
        this.channels[i].isOnline = true;
      }
    },
    add(channel: ChannelInfo) {
      if (!this.channels.some(c => c.channelId === channel.channelId)) {
        this.channels.push(channel);
      }
    },
    update(channel: DatabaseChannel) {
      const i = this.channels.findIndex(c => c.channelId === channel.channelId);
      if (i !== -1) {
        const ch = this.channels[i] as ChannelInfo;
        Object
          .keys(channel)
          .forEach(key => {
            //@ts-ignore
            ch[key] = channel[key];
          });
      }
    },
    destroy(channelId: number) {
      this.channels = this.channels.filter(x => x.channelId !== channelId);
      const channelStore = useChannelStore();
      const jobStore = useJobStore();
      channelStore.destroy(channelId);
      jobStore.deleteChannel(channelId);
    },
    pause(channelId: number) {
      const i = this.channels.findIndex(c => c.channelId === channelId);
      if (i !== -1) {
        this.channels[i].isRecording = false;
        this.channels[i].isPaused = true;
      }
    },
    resume(channelId: number) {
      const i = this.channels.findIndex(c => c.channelId === channelId);
      if (i !== -1) {
        this.channels[i].isPaused = false;
      }
    },
    fav(id: number) {
      const i = this.channels.findIndex(ch => ch.channelId === id);
      this.channels[i].fav = true;
    },
    unfav(id: number) {
      const i = this.channels.findIndex(ch => ch.channelId === id);
      this.channels[i].fav = false;
    },
    clear() {
      this.channels = [];
    },
    stop() {
      for (let i = 0; i < this.channels.length; i += 1) {
        this.channels[i].isRecording = false;
      }
    }
  },
});
