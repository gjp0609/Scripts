<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Check } from 'lucide-vue-next';
import {
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot
} from 'reka-ui';
import type { SearchEngineOption } from '../../types/bookmark';
import SiteFavicon from './SiteFavicon.vue';

const props = defineProps<{
  query: string;
  engines: SearchEngineOption[];
  engine: SearchEngineOption;
  resetToken: number;
  activeEngineIndex: number;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  'update:engine': [value: string];
  'search-box-ready': [element: HTMLDivElement];
  'search-input-ready': [element: HTMLInputElement];
  'search-keydown': [event: KeyboardEvent];
  'search-focus': [];
  'engine-menu-open': [value: boolean];
  'engine-active-change': [value: number];
  'engine-keydown': [event: KeyboardEvent];
}>();

const searchBoxEl = ref<HTMLDivElement | null>(null);
const searchInputEl = ref<HTMLInputElement | null>(null);
const engineMenuOpen = ref(false);
let engineCloseTimer: number | undefined;

function selectEngine(value: unknown) {
  if (typeof value !== 'string') return;
  emit('update:engine', value);
  closeEngineMenu();
}

function openEngineMenu() {
  window.clearTimeout(engineCloseTimer);
  if (!engineMenuOpen.value) {
    emit('engine-active-change', Math.max(0, props.engines.findIndex((item) => item.id === props.engine.id)));
    emit('engine-menu-open', true);
  }
  engineMenuOpen.value = true;
}

function scheduleCloseEngineMenu() {
  window.clearTimeout(engineCloseTimer);
  engineCloseTimer = window.setTimeout(closeEngineMenu, 140);
}

function closeEngineMenu() {
  window.clearTimeout(engineCloseTimer);
  if (engineMenuOpen.value) emit('engine-menu-open', false);
  engineMenuOpen.value = false;
}

function handleEngineKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
  if (!engineMenuOpen.value) openEngineMenu();
  emit('engine-keydown', event);
}

onMounted(() => {
  if (searchBoxEl.value) emit('search-box-ready', searchBoxEl.value);
  if (searchInputEl.value) {
    emit('search-input-ready', searchInputEl.value);
    searchInputEl.value.focus();
  }
});

onBeforeUnmount(() => window.clearTimeout(engineCloseTimer));

watch(() => props.query, closeEngineMenu);
watch(() => props.resetToken, closeEngineMenu);
</script>

<template>
  <header class="search-band">
    <div class="search-composer">
      <PopoverRoot :open="engineMenuOpen" @update:open="$event ? openEngineMenu() : closeEngineMenu()">
        <PopoverAnchor as-child>
          <button
            class="engine-select"
            type="button"
            aria-label="选择搜索引擎"
            :aria-expanded="engineMenuOpen"
            @pointerenter="openEngineMenu"
            @pointerleave="scheduleCloseEngineMenu"
            @focus="openEngineMenu"
            @click="openEngineMenu"
            @keydown="handleEngineKeydown"
          >
            <SiteFavicon :title="engine.title" accent="#777777" :sources="engine.faviconUrls" />
            <span>{{ engine.title }}</span>
          </button>
        </PopoverAnchor>
        <PopoverPortal>
          <PopoverContent
            class="engine-menu"
            side="bottom"
            align="start"
            :side-offset="6"
            @pointerenter="openEngineMenu"
            @pointerleave="scheduleCloseEngineMenu"
            @open-auto-focus="$event.preventDefault()"
            @close-auto-focus="$event.preventDefault()"
            @keydown="handleEngineKeydown"
          >
            <button
              v-for="(item, index) in props.engines"
              :key="item.id"
              class="engine-option"
              :class="{ selected: item.id === engine.id, active: index === activeEngineIndex }"
              type="button"
              :aria-pressed="item.id === engine.id"
              @pointerenter="emit('engine-active-change', index)"
              @focus="emit('engine-active-change', index)"
              @click="selectEngine(item.id)"
            >
                <span>{{ item.title }}</span>
                <small v-if="!item.builtin">{{ item.domain }}</small>
                <span v-if="item.id === engine.id" class="engine-check"><Check :size="13" /></span>
            </button>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>

      <div ref="searchBoxEl" class="search-input-shell">
        <input
          ref="searchInputEl"
          :value="query"
          type="text"
          autocomplete="off"
          spellcheck="false"
          aria-label="搜索书签"
          @focus="emit('search-focus')"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
          @keydown="emit('search-keydown', $event)"
        />
      </div>
    </div>
  </header>
</template>
