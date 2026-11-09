---
lede: A video of one person made into animation files — body, fingers and face — on this computer.
---
# Motion capture

Motion capture turns a video of one person into animation files — body, fingers and face — for Blender, Maya, Unreal,
Unity, iClone or any app that opens FBX, BVH, glTF or USD. It runs on this computer: nothing is uploaded. **Motion
capture** in the sidebar opens it.

## What it needs

- Windows with an NVIDIA graphics card with 8 GB of memory (the models run on it).
- One install from the AI page's Motion capture tab: the engine (about 7 GB) and its four models (about 11 GB). Each
  model shows its licence there: GEM-X (NVIDIA Open Model License), the SOMA body model (Apache-2.0), SAM 3D Body for the
  fingers (SAM License), RT-DETR person boxes (MIT). Live capture's MediaPipe models (Apache-2.0) come with the engine.
- FFmpeg, from the AI page, if the app doesn't have it yet.

## Recording a good take

- One person, the whole body in the picture from head to feet, all the time.
- The camera still on a stand or a table, or held in one place and turned to follow the person (choose "Turning to
  follow"). A camera that walks with the person isn't supported.
- Good light, clothes that stand out from the background, nothing covering the hands if you want the fingers.
- 30 frames a second or more; 1080p is plenty. Landscape for a person moving around, portrait for one standing.
- A take is at most 60 seconds: for a longer video, set the part to capture.

## Capturing

1. Open **Motion capture** and press **Add a video**.
2. Set the **Camera lens**: an iPhone's video carries its own lens (Automatic); for another phone give its main camera's
   35 mm equivalent (in its specifications, often 24–28 mm); for a webcam its diagonal field of view (often 70–90°).
3. Set the **Part of the video** if it is longer than 60 seconds, the **Camera** (Still or Turning to follow) and, with
   several people in view, **Pick in the picture** and click the person on the first frame.
4. **Uneven ground** for stairs, ramps or rough ground; **Arm fit** on unless the arms look wrong; **Finger smoothing**.
5. For the files: **In place** (the motion stays on the spot), and the **Rest pose** your character uses (T-pose or
   A-pose).
6. Press **Capture**. Progress shows each step and the time left; **Cancel** stops it, and **Continue** picks up where it
   stopped. A 5-second clip takes about 5 minutes on an 8 GB card.

## What you get

A preview with the skeleton drawn on the video, a 3D view, and the files to save: FBX, BVH, GLB, USD, C3D (joint points
for biomechanics tools), the face as a Live Link Face CSV (the layout Epic's Live Link Face app records: 52 ARKit curves,
for any ARKit-curve rig), the raw motion as JSON, the preview video and a contact sheet. The takes are kept in the data
folder's `mocap` folder and go in your backups.

## A take as a shot's guide

A captured take can lead a shot's clip: open the shot's clip, choose **Led by a guide video**, pick the take under **Or
from a motion capture take** and press **Use its pose**. Its pose video — the skeleton alone on black, the drawing the
clip model's guide follows — becomes the shot's guide, and the clip's person moves as yours did. For example: film
yourself walking to a door and turning, capture it, and use its pose on the shot where Mara crosses the deck.

## Fixing the feet (a worked example)

A walk where the left foot slides between frames 40 and 55:

1. Open **Foot contacts** under the take's results. The strip shows where each foot is planted.
2. Under **Left foot**, press **Add a contact** and set **From frame** 40 and **To frame** 55 (the end is the first frame
   after the contact). The take is at 30 frames a second, so that is 0.5 s.
3. Press **Apply contacts**. The feet and everything after them are made again in seconds — the models don't run again.
4. **Back to the found contacts** puts the contacts the capture found back in the list; press **Apply contacts** to
   make the take from them again.

## Live

The **Live** tab tracks the webcam in this window: press **Start camera**. **Record** keeps the motion; save it as BVH
and the face as a Live Link Face CSV. **Send to** streams it while it runs: VMC to VSeeFace, VNyan, Warudo or Unity
(their VMC receiver, usually port 39539), to Blender with the VMC Link add-on (an armature with standard humanoid bone
names, or a VRM avatar), or to Unreal with the VRM4U plugin's VMC receiver; or plain OSC to a receiver of your own. Live keeps the hips in one place, at
standing height, so crouching or jumping puts the feet through the floor or lifts them off it. Over VMC the face moves an
avatar that has Perfect Sync (ARKit) blendshapes; an avatar with only VRM's standard expressions gets the body and hands.

## When something goes wrong

- "Source video exceeds 60 seconds": set the part of the video.
- A take made with one lens, camera or person can't continue with another: press **Capture again from the start**.
- The graphics card is busy: another AI job holds it — a clip being made, for one; try again when it ends.
