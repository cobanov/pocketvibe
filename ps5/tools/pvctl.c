// Launches or closes a PS5 title without a controller: a payload for the ELF
// loader on port 9021. Build with -DTITLE_ID=\"PPSAxxxxx\" and -DLAUNCH or
// -DCLOSE. Close only kills the running app if it is that title, so it never
// takes down a game or the loader.

#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef struct {
  uint32_t size, user_id, options;
  uint64_t crash_report;
  uint32_t flags;
} launch_context;

int sceUserServiceInitialize(void *);
int sceUserServiceGetForegroundUser(uint32_t *);
int sceSystemServiceLaunchApp(const char *, char **, launch_context *);
int sceLncUtilGetAppIdOfRunningBigApp(void);
int sceLncUtilGetAppTitleId(uint32_t, char *);
int sceLncUtilKillApp(uint32_t);

int main(void) {
#ifdef LAUNCH
  launch_context ctx = {.size = sizeof ctx};
  char *argv[] = {0};
  sceUserServiceInitialize(0);
  int rc = sceUserServiceGetForegroundUser(&ctx.user_id);
  if (rc == 0) rc = sceSystemServiceLaunchApp(TITLE_ID, argv, &ctx);
  printf("launch %s: 0x%x\n", TITLE_ID, rc);
  return rc != 0;
#else
  int app = sceLncUtilGetAppIdOfRunningBigApp();
  char title[16] = {0};
  if (app < 0 || sceLncUtilGetAppTitleId(app, title) != 0 || strcmp(title, TITLE_ID) != 0) {
    printf("close %s: not running (running: %s)\n", TITLE_ID, title[0] ? title : "none");
    return 0;
  }
  int rc = sceLncUtilKillApp(app);
  printf("close %s: 0x%x\n", TITLE_ID, rc);
  return rc != 0;
#endif
}
