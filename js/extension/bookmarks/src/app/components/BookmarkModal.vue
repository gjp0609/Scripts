<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Check, ChevronDown, Plus, X } from 'lucide-vue-next';
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  TagsInputRoot
} from 'reka-ui';
import type { BookmarkView, FolderView, TagSummary } from '../../types/bookmark';
import { normalizeTag, SEARCH_SITE_TAG, SEARCH_TAG } from '../../services/searchService';

const props = defineProps<{
  open: boolean;
  folders: FolderView[];
  tags: TagSummary[];
  bookmark?: BookmarkView;
}>();

const emit = defineEmits<{
  close: [];
  save: [value: { id?: string; parentId: string; title: string; url: string; tags: string[]; description?: string; searchUrl?: string }];
}>();

const form = reactive({ title: '', url: '', parentId: '', tags: [] as string[], description: '', searchUrl: '' });
const tagInput = ref('');
const tagMenuOpen = ref(false);
const error = ref('');

const knownTags = computed(() => {
  const values = new Map(props.tags.map((tag) => [tag.normalizedName, tag.name]));
  values.set(SEARCH_TAG, values.get(SEARCH_TAG) ?? SEARCH_TAG);
  values.set(SEARCH_SITE_TAG, values.get(SEARCH_SITE_TAG) ?? SEARCH_SITE_TAG);
  return [...values.entries()].map(([normalizedName, name]) => ({
    name,
    normalizedName,
    searchCapability: normalizedName === SEARCH_TAG || normalizedName === SEARCH_SITE_TAG,
    count: props.tags.find((tag) => tag.normalizedName === normalizedName)?.count ?? 0
  }));
});

const filteredTags = computed(() => {
  const query = normalizeTag(tagInput.value);
  return knownTags.value
    .filter((tag) => !form.tags.some((selected) => normalizeTag(selected) === tag.normalizedName))
    .filter((tag) => !query || tag.normalizedName.includes(query))
    .sort((left, right) => {
      const leftPrefix = left.normalizedName.startsWith(query) ? 0 : 1;
      const rightPrefix = right.normalizedName.startsWith(query) ? 0 : 1;
      return Number(right.searchCapability) - Number(left.searchCapability) || leftPrefix - rightPrefix || right.count - left.count || left.name.localeCompare(right.name);
    });
});

const canCreateTag = computed(() => {
  const query = tagInput.value.trim();
  if (!query) return false;
  return !knownTags.value.some((tag) => tag.normalizedName === normalizeTag(query)) && !form.tags.some((tag) => normalizeTag(tag) === normalizeTag(query));
});

const hasSearch = computed(() => form.tags.some((tag) => normalizeTag(tag) === SEARCH_TAG));
const hasSearchSite = computed(() => form.tags.some((tag) => normalizeTag(tag) === SEARCH_SITE_TAG));
const siteDomain = computed(() => {
  if (!hasSearchSite.value) return '';
  try {
    const parsed = new URL(form.url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
});

watch(
  () => [props.open, props.bookmark, props.folders] as const,
  () => {
    if (!props.open) return;
    form.title = props.bookmark?.title ?? '';
    form.url = props.bookmark?.url ?? '';
    form.parentId = props.bookmark?.parentId ?? props.folders[0]?.id ?? '';
    form.tags = [...(props.bookmark?.extra.tags ?? [])];
    form.description = props.bookmark?.extra.description ?? '';
    form.searchUrl = props.bookmark?.extra.searchUrl ?? '';
    tagInput.value = '';
    error.value = '';
  },
  { immediate: true }
);

function updateOpen(value: boolean) {
  if (!value) emit('close');
}

function addTag(rawValue: string) {
  const value = rawValue.trim();
  if (!value || form.tags.some((tag) => normalizeTag(tag) === normalizeTag(value))) return;
  const normalized = normalizeTag(value);
  if (normalized === SEARCH_TAG) {
    form.tags = form.tags.filter((tag) => normalizeTag(tag) !== SEARCH_SITE_TAG);
  } else if (normalized === SEARCH_SITE_TAG) {
    form.tags = form.tags.filter((tag) => normalizeTag(tag) !== SEARCH_TAG);
    form.searchUrl = '';
  }
  form.tags.push(value);
  tagInput.value = '';
  tagMenuOpen.value = false;
}

function selectTag(value: unknown) {
  if (typeof value !== 'string') return;
  addTag(value.startsWith('__create__:') ? value.slice('__create__:'.length) : value);
}

function handleTagKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if ((event.key === ',' || event.key === '，') && tagInput.value.trim()) {
    event.preventDefault();
    addTag(tagInput.value);
    return;
  }
  if (event.key === 'Enter' && !filteredTags.value.length && tagInput.value.trim()) {
    event.preventDefault();
    addTag(tagInput.value);
    return;
  }
  if (event.key === 'Tab' && tagInput.value.trim()) {
    event.preventDefault();
    addTag(filteredTags.value[0]?.name ?? tagInput.value);
    return;
  }
  if (event.key === 'Backspace' && !tagInput.value && form.tags.length) {
    form.tags.pop();
  }
}

function handleTagPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? '';
  if (!/[,，\n]/.test(text)) return;
  event.preventDefault();
  text.split(/[,，\n]+/).forEach(addTag);
}

function removeTag(value: string) {
  form.tags = form.tags.filter((tag) => normalizeTag(tag) !== normalizeTag(value));
  if (normalizeTag(value) === SEARCH_TAG) form.searchUrl = '';
}

function save() {
  error.value = '';
  if (!form.parentId || !form.title.trim() || !form.url.trim()) {
    error.value = '请填写标题、URL 和目录';
    return;
  }
  if (hasSearch.value && !/\$\{keyword\}|\{keyword\}/.test(form.searchUrl)) {
    error.value = '搜索模板必须包含 {keyword}';
    return;
  }
  if (hasSearchSite.value && !siteDomain.value) {
    error.value = 'search_site 需要有效的 HTTP(S) URL';
    return;
  }
  emit('save', {
    id: props.bookmark?.id,
    parentId: form.parentId,
    title: form.title.trim(),
    url: form.url.trim(),
    tags: form.tags,
    description: form.description.trim() || undefined,
    searchUrl: hasSearch.value ? form.searchUrl.trim() : undefined
  });
}
</script>

<template>
  <DialogRoot :open="open" @update:open="updateOpen">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content bookmark-dialog" @escape-key-down.stop>
        <header class="dialog-head">
          <div><DialogTitle>{{ bookmark ? '编辑书签' : '添加书签' }}</DialogTitle><DialogDescription class="sr-only">编辑书签信息</DialogDescription></div>
          <button type="button" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
        </header>

        <form class="editor-form" @submit.prevent="save">
          <label><span>标题</span><input v-model="form.title" required type="text" autofocus /></label>
          <label><span>URL</span><input v-model="form.url" required type="text" /></label>
          <label>
            <span>目录</span>
            <SelectRoot v-model="form.parentId">
              <SelectTrigger class="field-select"><SelectValue placeholder="选择目录" /><ChevronDown :size="14" /></SelectTrigger>
              <SelectPortal><SelectContent class="field-select-menu" position="popper" :side-offset="5"><SelectViewport>
                <SelectItem v-for="folder in folders" :key="folder.id" class="field-select-option" :value="folder.id">
                  <SelectItemText>{{ folder.title }}</SelectItemText><SelectItemIndicator><Check :size="13" /></SelectItemIndicator>
                </SelectItem>
              </SelectViewport></SelectContent></SelectPortal>
            </SelectRoot>
          </label>

          <div class="tag-field">
            <span class="field-label">标签</span>
            <ComboboxRoot :model-value="null" v-model:open="tagMenuOpen" open-on-focus open-on-click ignore-filter @update:model-value="selectTag">
              <ComboboxAnchor as-child>
                <div class="tag-editor">
                  <TagsInputRoot v-model="form.tags" class="tag-token-list" :duplicate="false">
                    <TagsInputItem v-for="tag in form.tags" :key="normalizeTag(tag)" class="tag-token" :value="tag">
                      <TagsInputItemText />
                      <small v-if="normalizeTag(tag) === SEARCH_TAG || normalizeTag(tag) === SEARCH_SITE_TAG">搜索能力</small>
                      <TagsInputItemDelete aria-label="移除标签" @click="removeTag(tag)"><X :size="12" /></TagsInputItemDelete>
                    </TagsInputItem>
                  </TagsInputRoot>
                  <ComboboxInput class="tag-entry-input" v-model="tagInput" aria-label="输入或创建标签" @keydown="handleTagKeydown" @paste="handleTagPaste" />
                </div>
              </ComboboxAnchor>
                <ComboboxPortal>
                  <ComboboxContent class="tag-suggestion-menu" position="popper" :side-offset="4">
                    <ComboboxViewport>
                      <ComboboxItem v-for="tag in filteredTags" :key="tag.normalizedName" class="tag-suggestion" :value="tag.name">
                        <span>{{ tag.name }}</span><small>{{ tag.searchCapability ? '搜索能力' : `${tag.count} 次` }}</small>
                        <ComboboxItemIndicator><Check :size="13" /></ComboboxItemIndicator>
                      </ComboboxItem>
                      <ComboboxItem v-if="canCreateTag" class="tag-suggestion create" :value="`__create__:${tagInput.trim()}`">
                        <Plus :size="13" /><span>创建“{{ tagInput.trim() }}”</span>
                      </ComboboxItem>
                      <ComboboxEmpty class="tag-suggestion-empty">无匹配标签</ComboboxEmpty>
                    </ComboboxViewport>
                  </ComboboxContent>
                </ComboboxPortal>
            </ComboboxRoot>
          </div>

          <label><span>备注</span><textarea v-model="form.description" rows="3" /></label>
          <label v-if="hasSearch"><span>搜索 URL 模板</span><input v-model="form.searchUrl" type="text" /></label>
          <div v-if="hasSearchSite" class="site-preview"><span>站点搜索</span><strong>{{ siteDomain ? `site:${siteDomain}` : '请填写有效 URL' }}</strong></div>
          <p v-if="error" class="form-error">{{ error }}</p>
          <footer class="dialog-foot"><button class="button-secondary" type="button" @click="emit('close')">取消</button><button class="button-primary" type="submit">保存</button></footer>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
