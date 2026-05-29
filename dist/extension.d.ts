import { ExtensionAPI } from '@earendil-works/pi-coding-agent';

declare function piGsdExtension(pi: ExtensionAPI): void;
declare function rewriteMessageForRuntime<T>(message: T, officialRoot: string): T;

export { piGsdExtension as default, rewriteMessageForRuntime };
