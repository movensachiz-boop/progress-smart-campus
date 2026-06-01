export type CameraMode = "environment" | "user";

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraints = MediaTrackConstraintSet & { torch?: boolean };
type TorchSupportedConstraints = MediaTrackSupportedConstraints & { torch?: boolean };

const highResVideo = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

const stopStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => track.stop());
};

export const getTorchCapability = (track?: MediaStreamTrack | null) =>
  Boolean((track?.getCapabilities?.() as TorchCapabilities | undefined)?.torch);

export const canAttemptTorch = (track?: MediaStreamTrack | null) =>
  getTorchCapability(track) || Boolean((navigator.mediaDevices.getSupportedConstraints?.() as TorchSupportedConstraints | undefined)?.torch);

export const applyTorchConstraint = async (track: MediaStreamTrack, on: boolean) => {
  const torch = { torch: on } as TorchConstraints;
  const attempts = [
    { advanced: [torch] } as MediaTrackConstraints,
    torch as MediaTrackConstraints,
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const getStream = (video: MediaTrackConstraints) =>
  navigator.mediaDevices.getUserMedia({ video, audio: false });

export const createCameraStream = async (mode: CameraMode, preferTorch = false): Promise<MediaStream> => {
  if (mode === "user") {
    return getStream({ facingMode: { ideal: "user" }, ...highResVideo });
  }

  let fallback: MediaStream | null = null;

  try {
    fallback = await getStream({ facingMode: { exact: "environment" }, ...highResVideo });
    if (!preferTorch || getTorchCapability(fallback.getVideoTracks()[0])) return fallback;
    stopStream(fallback);
    fallback = null;
  } catch {
    fallback = null;
  }

  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  const rearFirst = devices
    .filter((device) => device.kind === "videoinput")
    .sort((a, b) => {
      const rear = /(back|rear|environment|main)/i;
      return Number(rear.test(b.label)) - Number(rear.test(a.label));
    });

  for (const device of rearFirst) {
    try {
      const stream = await getStream({ deviceId: { exact: device.deviceId }, ...highResVideo });
      if (!preferTorch || getTorchCapability(stream.getVideoTracks()[0])) {
        stopStream(fallback);
        return stream;
      }
      if (!fallback) fallback = stream;
      else stopStream(stream);
    } catch {
      // Try the next available camera.
    }
  }

  if (fallback) return fallback;
  return getStream({ facingMode: { ideal: "environment" }, ...highResVideo });
};