declare module "react-katex" {
  import * as React from "react";
  export interface InlineMathProps {
    math?: string;
    children?: React.ReactNode;
  }
  export interface BlockMathProps {
    math?: string;
    children?: React.ReactNode;
  }
  export const InlineMath: React.ComponentType<InlineMathProps>;
  export const BlockMath: React.ComponentType<BlockMathProps>;
}
