# Media workbench status

The Brand editor now has a local video picker/preview, manual cut/title editor, bounded plan review and explicit JSON plan download. Selection uses a temporary browser object URL, revoked when replaced or unmounted. The picker does not copy footage to the Brand or send it anywhere. The path in the plan describes a future imported Brand asset. It must not be passed directly to a job runner until import has completed and Host source validation has passed. Any plan edit invalidates review. JSON is not MP4 export.

45 focused tests pass across the workbench, existing Brand editor, pipeline and job ownership. Client package compiles. The actual browser workbench review surface was inspected. FFmpeg is installed here; Whisper and HyperFrames executables are not, and no end-to-end rendering has been claimed.

Remaining for #78/#87: authenticated bounded binary import and output streaming for the single-user Host; server-held source handles and reviewed-plan revision approval; persistent render/status/cancel UI; Session plan proposal schema, not direct arbitrary edit execution; exact CLI packaging and real local Whisper/HyperFrames installation/smoke tests; captions, Brand styling/audio synchronization; MP4 preview/download; desktop verification. The editor's existing Export stays disabled and the Host readiness flag stays false.

No cloud credentials are needed for the local pipeline itself. Live deployment, multi-user runtime isolation and provider generation remain separately gated. Downloading model weights/tool dependencies needs network and disk capacity, not a secret. This PR does not turn missing executable checks into a user-permission blocker.
