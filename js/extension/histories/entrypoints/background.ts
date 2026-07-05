import { createRuntimeAdapter } from '../src/runtime/browser-adapter';

export default defineBackground(() => {
  const runtime = createRuntimeAdapter();

  runtime.onInstalled(() => {
    console.info('[histories] installed');
  });

  runtime.onActionClicked(() => {
    runtime.openOptionsPage();
  });

  runtime.onMessage(async (message) => {
    if (message?.type === 'histories:ping') {
      return {
        type: 'histories:pong',
        version: runtime.getManifest().version
      };
    }

    return undefined;
  });
});
