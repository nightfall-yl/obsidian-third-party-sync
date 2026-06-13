import { base64, base64url } from "rfc4648";
import { reverseString } from "./misc";

import type { ThirdPartySyncPluginSettings } from "./baseTypes";

import { log } from "./moreOnLog";

const DEFAULT_README: string =
  "The file contains sensitive info, so DO NOT take screenshot of, copy, or share it to anyone! It's also generated automatically, so do not edit it manually.";

interface MessyConfigType {
  readme: string;
  d: string;
}

/**
 * this should accept the result after loadData();
 */
export const messyConfigToNormal = (
  x: MessyConfigType | ThirdPartySyncPluginSettings | null | undefined
): ThirdPartySyncPluginSettings | null | undefined => {
  if (x === null || x === undefined) {
    return x;
  }
  if ("readme" in x && "d" in x) {
    // we should decode
    const y = JSON.parse(
      new TextDecoder().decode(
        base64url.parse(reverseString(x["d"]), {
          out: Uint8Array,
          loose: true,
        }) as Uint8Array
      )
    ) as ThirdPartySyncPluginSettings;
    return y as ThirdPartySyncPluginSettings;
  } else {
    return x;
  }
};

/**
 * this should accept the result of original config
 */
export const normalConfigToMessy = (
  x: ThirdPartySyncPluginSettings | null | undefined
) => {
  if (x === null || x === undefined) {
    return x;
  }
  const y = {
    readme: DEFAULT_README,
    d: reverseString(
      base64url.stringify(
        new TextEncoder().encode(JSON.stringify(x)), {
          pad: false,
        }
      )
    ),
  };
  return y;
};
