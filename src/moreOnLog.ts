// It's very dangerous for this file to depend on other files in the same project.
// We should avoid this situation as much as possible.

import * as origLog from "loglevel";

export const log = origLog.getLogger("rs-default");
