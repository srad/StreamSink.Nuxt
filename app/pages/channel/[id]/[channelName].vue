<template>
  <div>
    <BusyOverlay :visible="busyOverlay"/>

    <NativeConfirmDialog :show="showConfirm" @cancel="showConfirm=false" @confirm="deleteChannel" text="Are you sure you want to delete this channel?"/>

    <ModalConfirmDialog :show="showDeleteSelectedRecordings" @cancel="showDeleteSelectedRecordings=false" @confirm="destroySelection">
      <template v-slot:header>
        Confirm selection
      </template>
      <template v-slot:body>
        <ul class="list-unstyled">
          <li v-for="recording in selectedRecordings" class="list-group-item d-flex justify-content-between mb-2">
            <img class="img-thumbnail w-20 me-2" :src="`${fileUrl}/${recording.previewCover || (recording.channelName + '/.previews/live.jpg')}`"/>
            <div class="w-80">
              <div>{{ recording.filename }}</div>
              <div>{{ (recording.duration / 60).toFixed(1) }}min -
                {{ (Math.fround(recording.size / 1024 / 1024 / 1024)).toFixed(1) }}GB
              </div>
            </div>
          </li>
        </ul>
      </template>
    </ModalConfirmDialog>

    <div ref="upload" style="display: none" class="modal modal-dialog modal-dialog-centered" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">Uploading Video</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <h5>
              Progress: {{ (uploadProgress * 100).toFixed(0) }}%
            </h5>
            <div class="progress">
              <div class="progress-bar progress-bar-animated progress-bar-striped bg-warning" role="progressbar" :style="{width: `${uploadProgress*100}%`}" aria-valuemax="1" aria-valuemin="0" aria-valuenow="0.4"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-warning" @click="cancelUpload">Cancel Upload</button>
          </div>
        </div>
      </div>
    </div>

    <nav class="navbar fixed-bottom navbar-light bg-light border-info border-top">
      <div class="container-fluid justify-content-between">
        <OptionsMenu v-if="!areItemsSelected"
                     :channel-paused="channel.isPaused"
                     :multi-select="selectedRecordings.length === 0"
                     @file="fileSelected"
                     @pause="pauseChannel"
                     @delete="showConfirm=true"/>

        <div class="btn-group">
          <button type="button" v-if="areItemsSelected" class="btn btn-danger justify-content-between me-2" @click="showDeleteSelectedRecordings=true">
            <span class="me-2">Delete selection</span>
            <i class="bi bi-trash3-fill"/>
          </button>
          <button type="button" v-if="areItemsSelected" class="btn btn-primary justify-content-between me-2" @click="cancelSelection">
            <span class="me-2">Cancel</span>
            <i class="bi bi-stop-fill"/>
          </button>
          <button v-if="selectedRecordings.length === 0" type="button" class="btn d-flex justify-content-between" :class="{'btn-warning' : channel.fav, 'btn-secondary' : !channel.fav}" @click="bookmark">
            <span class="me-2">Bookmark</span>
            <i style="color: black" class="bi" :class="{'bi-star-fill' : channel.fav, 'bi-star' : !channel.fav}"/>
          </button>
        </div>
      </div>
    </nav>

    <div class="d-flex align-items-center mb-3 justify-content-between pb-2 border-bottom">
      <div class="text-primary  fs-5 fw-bolder">{{ channel.displayName }}</div>
      <div class="d-flex align-items-center fs-5">
        <button type="button" class="btn btn-secondary" disabled>Count: {{ channel.recordingsCount }}</button>
        <button type="button" class="btn btn-secondary ms-2" disabled>
          Size: {{ (channel.recordingsSize! / 1024 / 1024 / 1024).toFixed(1) }}GB
        </button>
      </div>
    </div>

    <div class="row mb-5">
      <div v-for="recording in channel.recordings" :key="recording.filename" class="mb-3 col-lg-6 col-xl-4 col-xxl-4 col-md-6">
        <RecordingItem
            @destroyed="destroyRecording"
            @checked="selectRecording"
            :show-selection="true"
            :recording="recording"
            :show-title="false"/>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import RecordingItem from '~/components/RecordingItem.vue';
import type {
  DatabaseRecording,
  DatabaseRecording as RecordingResponse,
  ServicesChannelInfo
} from '~/services/api/v1/StreamSinkClient';
import { onMounted, computed, ref, useTemplateRef, reactive } from 'vue';
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router';
import { MessageType, connectSocket, socketOn, closeSocket } from '~/utils/socket';
import BusyOverlay from '~/components/BusyOverlay.vue';
import { useToastStore } from '~~/stores/toast';
import { useChannelStore } from '~~/stores/channel';
import { useJobStore } from '~~/stores/job';
import { useNuxtApp } from '#app/nuxt';
import { useAsyncData } from '#app';
import { useHead, watch } from '#imports';
import OptionsMenu from '~/components/controls/OptionsMenu.client.vue';
import ModalConfirmDialog from '~/components/modals/ModalConfirmDialog.client.vue';
import NativeConfirmDialog from '~/components/modals/NativeConfirmDialog.client.vue';
import { useRuntimeConfig } from 'nuxt/app';

// --------------------------------------------------------------------------------------
// Declarations
// --------------------------------------------------------------------------------------

const route = useRoute();
const router = useRouter();

const jobStore = useJobStore();
const toastStore = useToastStore();
const channelStore = useChannelStore();

// Elements
const upload = useTemplateRef<HTMLDivElement>('upload');

const channelId = (+route.params.id!) as unknown as number;

// Get Data
const { data } = await useAsyncData('channel', () => {
  const { $client } = useNuxtApp();
  return $client.channels.channelsDetail(channelId);
});

if (!data.value) {
  await router.replace('/streams/live');
}

data.value?.recordings?.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
data.value?.recordings?.sort((a, b) => b.videoType.localeCompare(a.videoType));
const channel = ref<ServicesChannelInfo>(data.value);
const selectedRecordings = ref<RecordingResponse[]>([]);
const uploadProgress = ref(0);
const busyOverlay = ref(false);

let uploadAbortController: AbortController | null = null;

const showModal = ref(false);
const showConfirm = ref(false);
const showDeleteSelectedRecordings = ref(false);

const config = useRuntimeConfig();
const fileUrl = config.public.fileUrl;

// --------------------------------------------------------------------------------------
// Computes
// --------------------------------------------------------------------------------------

const areItemsSelected = computed(() => selectedRecordings.value.length > 0);

// --------------------------------------------------------------------------------------
// Methods
// --------------------------------------------------------------------------------------

const pauseChannel = (element: HTMLInputElement): void => {
  const { $client } = useNuxtApp();
  const fn = element.checked ? $client.channels.resumeCreate : $client.channels.pauseCreate;
  fn(channel.value!.channelId).then(() => {
    if (element.checked) {
      channelStore.resume(channel.value!.channelId);
    } else {
      channelStore.pause(channel.value!.channelId);
    }
    toastStore.info({
      title: element.checked ? 'Channel resume' : 'Channel pause',
      message: `Channel ${channel.value?.displayName}`
    });
  }).catch((res: any) => alert(res.error));
};

const cancelSelection = () => selectedRecordings.value = [];

const destroySelection = async () => {
  try {
    const { $client } = useNuxtApp();

    for (let i = 0; i < selectedRecordings.value.length; i++) {
      const rec = selectedRecordings.value[i] as RecordingResponse;
      await $client.recordings.recordingsDelete(rec.recordingId);
      const index = channel.value.recordings.findIndex((x: DatabaseRecording) => x.recordingId === rec.recordingId);
      if (index !== -1) {
        channel.value.recordings.splice(index, 1);
      }
    }
    // Clear selection.
    toastStore.success({ title: 'Deleted recordings', message: `Deleted ${selectedRecordings.value.length} files.` });
    selectedRecordings.value = [];
  } catch (e) {
    toastStore.error({ title: 'Deletion failed', message: e.message });
  } finally {
    showDeleteSelectedRecordings.value = false;
  }
};

const selectRecording = ({ checked, recording }: { checked: boolean, recording: RecordingResponse }) => {
  if (checked && !selectedRecordings.value.some(x => x.recordingId === recording.recordingId)) {
    selectedRecordings.value.push(recording);
  } else {
    selectedRecordings.value = selectedRecordings.value.filter(x => x.recordingId !== recording.recordingId);
  }
};

const deleteChannel = async () => {
  try {
    busyOverlay.value = true;
    const { $client } = useNuxtApp();
    await $client.channels.channelsDelete(channelId);
    channelStore.destroy(channelId);
    toastStore.success({ title: 'Channel deleted', message: `Channel ${channel.value?.displayName}` });
    await router.replace('/');
  } catch (e: any) {
    alert(e);
  } finally {
    busyOverlay.value = false;
  }
};

const cancelUpload = () => {
  if (uploadAbortController) {
    uploadAbortController.abort();
  }
  showModal.value = false;
};

const fileSelected = async (file: File) => {
  try {
    uploadProgress.value = 0;
    showModal.value = true;
    const { $client } = useNuxtApp();
    const [req, abortController] = $client.channelUpload(channelId, file, (pcent: number) => uploadProgress.value = pcent);
    uploadAbortController = abortController;
    const recording = await req;
    uploadProgress.value = 0;
    channel.value?.recordings?.unshift(recording);
    uploadAbortController = null;
    showModal.value = false;
  } catch (e) {
    alert(e);
    showModal.value = false;
  }
};

const destroyRecording = (recording: RecordingResponse) => {
  if (channel.value?.recordings) {
    for (let i = 0; i < channel.value.recordings.length; i += 1) {
      if (channel.value.recordings && channel.value?.recordings[i]!.recordingId === recording.recordingId) {
        jobStore.deleteRecording(recording.recordingId);
        channel.value?.recordings?.splice(i, 1);
        break;
      }
    }
  }
};

const bookmark = () => {
  const { $client } = useNuxtApp();
  const fn = channel.value!.fav ? $client.channels.unfavPartialUpdate : $client.channels.favPartialUpdate;

  fn(channel.value!.channelId)
      .then(() => channel.value!.fav = !channel.value!.fav)
      .catch((err: any) => alert(err));
};

// --------------------------------------------------------------------------------------
// Hooks
// --------------------------------------------------------------------------------------

onBeforeRouteLeave((to, from) => {
  closeSocket();
});

useHead({
  title: channel.value!.displayName
});

onMounted(async () => {
  try {
    await connectSocket();

    socketOn(MessageType.RecordingAdd, recording => {
      const r = recording as RecordingResponse;
      channelStore.addRecording(r);
    });

    window.scrollTo(0, 0);
  } catch (error: any) {
    alert(error.error);
    router.back();
  }
});
</script>
