declare module "latex.js" {
  export class HtmlGenerator {
    constructor(options?: { hyphenate?: boolean; documentClass?: string });
    domFragment(): DocumentFragment;
    applyLengthsAndGeometryToDom(element: HTMLElement): void;
  }

  export function parse(
    source: string,
    options: { generator: HtmlGenerator },
  ): HtmlGenerator;
}
