import { onBeforeUnmount, onMounted } from 'vue';

export function useModalEscape(isOpen: () => boolean, onClose: () => void) {
  const handleKeydown = (event: KeyboardEvent) => {
    if (!isOpen() || event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
}
