declare module "*.jsx" {
  import type { ComponentType } from "react";
  const component: ComponentType<unknown>;
  export default component;
}
