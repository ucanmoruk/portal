declare module "html-to-docx" {
  type HtmlToDocxOptions = Record<string, unknown>;

  export default function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string,
    documentOptions?: HtmlToDocxOptions,
    footerHTMLString?: string,
  ): Promise<Buffer>;
}
