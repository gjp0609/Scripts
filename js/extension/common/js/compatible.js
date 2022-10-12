export const isFirefox = (await chrome.runtime.getBrowserInfo()).name === 'Firefox';

export default null;
