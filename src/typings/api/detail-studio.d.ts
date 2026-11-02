declare namespace Api.DetailStudio {
  interface Node {
    id: string; type: 'text' | 'image' | 'rect' | 'path';
    x: number; y: number; width: number; height: number; rotation: number;
    fill: string; text?: string; fontSize?: number; fontFamily?: string;
    align?: 'left' | 'center' | 'right'; src?: string; points?: number[];
    stroke?: string; strokeWidth?: number; locked?: boolean;
    cropX?: number; cropY?: number; cropWidth?: number; cropHeight?: number;
    edgeFade?: number;
  }
  interface Page { id: string; width: 750; height: number; background: string; nodes: Node[] }
  interface Document { targetPageId?: string; schemaVersion: 1; theme: 'dark' | 'light' | 'warm'; mode: 'mixed' | 'image'; pages: Page[] }
  interface Revision { id: string; documentKey: string; sourceJson: string; description: string }
  interface Capability { enabled: boolean; keyConfigured: boolean; reasoningModel?: string; imageModel?: string }
  interface Task { id: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'; progress: number; resultJson?: string; errorMessage?: string }
}
