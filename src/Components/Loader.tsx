import React from 'react'
import { useProgress, Html } from '@react-three/drei'
import styled, { keyframes } from 'styled-components'

const spin = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`

const LoaderWrapper = styled.div`
   position: relative;
   left: 50%;
   top: 50%;
   width: 150px;
   height: 150px;
   margin: 0 0 0 -75px;
   border-radius: 50%;
   border: 3px solid transparent;
   border-top-color: #fff;
   animation: ${spin} 2s linear infinite;
   z-index: 1000;

   &:before,
   &:after {
      content: '';
      position: absolute;
      border-radius: 50%;
      border: 3px solid transparent;
      border-top-color: #fff;
   }

   &:before {
      top: 5px;
      left: 5px;
      right: 5px;
      bottom: 5px;
      animation: ${spin} 3s linear infinite;
   }

   &:after {
      top: 15px;
      left: 15px;
      right: 15px;
      bottom: 15px;
      animation: ${spin} 1.5s linear infinite;
   }
`

const Mushroom = styled.span`
   font-size: ${({ size }) => size || '50px'};
   animation-name: ${({ animation }) => animation};
   animation-duration: ${({ duration }) => duration || '3s'};
   animation-iteration-count: infinite;
   animation-direction: ${({ direction }) => direction || 'normal'};
`

const Logo = styled.div`
   position: absolute;
   top: 50%;
   left: 50%;
   margin-top: -35px;
   margin-left: -35px;
   width: 100px;
   height: 100px;
`

const LoadingText = styled.div`
   padding-top: 20px;
   font-weight: bold;
   color: #fff;
   text-align: center;
   width: 500px;
`

export default function Loader() {
   const { item } = useProgress()

   return (
      <Html center>
         <LoaderWrapper>
            <Mushroom className="mushroom" animation="rotate">
               🍄
            </Mushroom>
            <Mushroom className="mushroom mushroom-2" size="40px" animation="bounce" duration="4s">
               🍄
            </Mushroom>
            <Mushroom className="mushroom mushroom-3" size="30px" animation="rotate" duration="2s" direction="reverse">
               🍄
            </Mushroom>
         </LoaderWrapper>
         <Logo>
            <svg
               id="Layer_1"
               height="36"
               data-name="Layer 1"
               xmlns="http://www.w3.org/2000/svg"
               viewBox="0 0 650.92 312.12"
            >
               <path
                  fill="white"
                  d="M398.05,323.6c8.3,0,10-2.78,5.88-9.91q-83.74-146-167.45-292.07c-4-7-9.47-10.08-17.46-10-41,.12-82,0-123,0-8,0-9.62,2.87-5.63,9.78q45.89,79.35,91.8,158.67,28.4,49.06,56.8,98.13c3,5.14,2.5,6-3.29,6-7.83,0-15.68-.32-23.5,0-4.85.21-7.41-1.77-9.76-5.86q-39.16-68.22-78.66-136.27c-3.76-6.5-7.29-6.47-11.1.13Q81.6,196.06,50.54,249.94,32,282.18,13.36,314.42c-1.68,2.9-3.21,5.95.45,8.24,1.52.95,3.81.9,5.76.91Z"
                  transform="translate(-11.57 -11.57)"
               />
               <path
                  fill="white"
                  d="M275.3,11.61c-7.3,0-9.11,3.05-5.54,9.27Q317.13,103.41,364.5,186q36.15,63,72.18,126.14c4.5,7.94,10.33,11.66,19.67,11.59,40.5-.28,81-.09,121.5-.08,8.24,0,9.91-2.84,5.77-10q-45.25-78.27-90.57-156.51Q464,106.94,435,56.79c-2.72-4.7-2.19-5.69,3.24-5.73,7.5,0,15,.49,22.49-.09,6-.45,8.85,2.18,11.62,7q38.79,67.58,78,135c4,6.87,7.3,6.78,11.32-.17q49.27-85.47,98.57-170.93c4.3-7.46,2.72-10.23-5.89-10.23Z"
                  transform="translate(-11.57 -11.57)"
               />
            </svg>
         </Logo>
         <LoadingText>loading File - {item}</LoadingText>
      </Html>
   )
}
