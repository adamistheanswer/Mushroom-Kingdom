/* eslint-disable */
// @ts-nocheck
import * as React from "react";
import { useRef } from "react";
import { Canvas, useFrame, extend } from "@react-three/fiber";
import { Stats, OrbitControls } from "@react-three/drei";
import { io } from "socket.io-client";
import useAppStore from "./store";

import {
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  AmbientLight,
  SpotLight,
  PointLight,
  GridHelper,
  Object3D,
} from "three";
import FPSControls from "./FPSControls";

extend({
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  AmbientLight,
  SpotLight,
  PointLight,
  GridHelper,
  Object3D,
});

function UserObject(props: JSX.IntrinsicElements["mesh"]) {
  // This reference will give us direct access to the THREE.Mesh object
  const ref = useRef<THREE.Mesh>(null!);

  // // Rotate mesh every frame, this is outside of React without overhead
  // useFrame(() => (ref.current.rotation.x += 0.01));

  return (
    <mesh ref={ref} {...props} scale={1}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={0x00ff00} wireframe={true} />
    </mesh>
  );
}

type SceneProps = {
  socket: any;
};

function Scene(props: SceneProps): JSX.Element {
  const { socket } = props;

  const localPositions = useAppStore((state: any) => state.localPositions);
  // const spawnX = useAppStore((state: any) => state.spawnX);
  // const spawnZ = useAppStore((state: any) => state.spawnZ);

  const UserObjects = Object.values(localPositions);

  // const myObject3D = new Object3D();

  // myObject3D.position.x = spawnX;
  // myObject3D.position.z = spawnZ;

  // setInterval(() => {
  //   socket.emit("update", {
  //     t: Date.now(),
  //     p: myObject3D.position,
  //     r: myObject3D.rotation,
  //   });
  // }, 50);

  return (
    <>
      <FPSControls
        socket={socket}
        camProps={{
          makeDefault: true,
          fov: 80,
          position: [0, 2.537, 0.7],
        }}
        orbitProps={{
          target: [0, 2.537, 0],
        }}
        // enableJoystick
        enableKeyboard
      />
      {UserObjects}
    </>
  );
}

export default function App() {
  const localPositions: { [id: string]: any } = {};
  const socket = io();

  const setUerId = useAppStore((state: any) => state.setUserId);

  const setLocalPositions = useAppStore(
    (state: any) => state.setLocalPositions
  );

  socket.on("connect", function () {
    console.log("connect");
  });

  socket.on("disconnect", function (message: any) {
    console.log("disconnect " + message);
  });

  socket.on("id", (id: string) => {
    setUerId(id);
  });

  socket.on("clients", (clients: any) => {
    let pingStatsHtml = "Socket Ping Stats<br/><br/>";
    Object.keys(clients).forEach((clientId) => {
      pingStatsHtml +=
        clientId + " " + (Date.now() - clients[clientId].t) + "ms<br/>";
      if (!localPositions[clientId]) {
        localPositions[clientId] = <UserObject key={clientId} />;
      } else {
        if (clients[clientId].p || clients[clientId].r) {
          localPositions[clientId] = (
            <UserObject
              key={clientId}
              rotation={
                clients[clientId].r && [
                  clients[clientId].r._x,
                  clients[clientId].r._y,
                  clients[clientId].r._z,
                ]
              }
              position={
                clients[clientId].p && [
                  clients[clientId].p.x,
                  clients[clientId].p.y,
                  clients[clientId].p.z,
                ]
              }
            />
          );
        }
      }

      setLocalPositions(localPositions);
    });

    (document.getElementById("pingStats") as HTMLDivElement).innerHTML =
      pingStatsHtml;
  });

  socket.on("removeClient", (clientId: string) => {
    delete localPositions[clientId];
  });

  return (
    <Canvas camera={{ position: [0, 4, 4] }}>
      <Stats />
      <ambientLight intensity={0.5} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
      <pointLight position={[-10, -10, -10]} />
      <gridHelper position-y={-0.5} />
      <Scene socket={socket} />
    </Canvas>
  );
}
