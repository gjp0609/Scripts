import { nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties, type Ref } from 'vue';

export function useSearchOverlayPosition(options: {
  currentEngineId: Ref<string>;
  visible: Ref<boolean>;
}) {
  const searchBoxElement = ref<HTMLDivElement>();
  const style = ref<CSSProperties>({ visibility: 'hidden' });

  function update() {
    const element = searchBoxElement.value;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - 24);
    style.value = {
      top: `${rect.bottom + 6}px`,
      left: `${Math.min(Math.max(12, rect.left), window.innerWidth - width - 12)}px`,
      width: `${width}px`,
      visibility: 'visible'
    };
  }

  function schedule() {
    void nextTick().then(update);
  }

  function setSearchBoxElement(element: HTMLDivElement) {
    searchBoxElement.value = element;
    schedule();
  }

  onMounted(() => {
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', update);
  });

  watch(
    () => [options.currentEngineId.value, options.visible.value],
    schedule,
    { flush: 'post' }
  );

  return { style, schedule, setSearchBoxElement };
}
