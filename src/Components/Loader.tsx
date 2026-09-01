import React from 'react'
import { Html } from '@react-three/drei'
import { useLoadingProgress } from '../Utils/useLoadingProgress'
import styled, { keyframes } from 'styled-components'

const spin = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`

const Screen = styled.div`
   position: absolute;
   inset: 0;
   display: flex;
   align-items: center;
   justify-content: center;
   overflow: hidden;
`

const ForestBG = styled.div`
   position: absolute;
   inset: 0;
   background: #102b1b;
   z-index: 0;
`

const Content = styled.div`
   position: relative;
   z-index: 1;
   display: flex;
   flex-direction: column;
   align-items: center;
   box-sizing: border-box;
   width: 100%;
   max-width: 500px;
   padding: 0 max(16px, env(safe-area-inset-left)) 0 max(16px, env(safe-area-inset-right));
   text-align: center;
`

const forestText = keyframes`
  0% {
    text-shadow: 0 0 2px #d8e8a4, 0 0 5px #8fb15c, 0 0 10px #456f35;
  }
  33% {
    text-shadow: 0 0 2px #ffe3a3, 0 0 5px #b98445, 0 0 10px #4e321d;
  }
  66% {
    text-shadow: 0 0 2px #b8d98c, 0 0 5px #5e9a52, 0 0 10px #1d4a2e;
  }
  100% {
    text-shadow: 0 0 2px #d8e8a4, 0 0 5px #8fb15c, 0 0 10px #456f35;
  }
`

const SpinnerBox = styled.div`
   position: relative;
   flex: none;
   width: 150px;
   height: 150px;
`

const LoaderWrapper = styled.div`
   position: absolute;
   inset: 0;
   box-sizing: border-box;
   border-radius: 50%;
   border: 3px solid transparent;
   border-top-color: #d8e8a4;
   animation: ${spin} 2s linear infinite;
   filter: drop-shadow(0 0 12px rgba(143, 177, 92, 0.45));

   &:before,
   &:after {
      content: '';
      position: absolute;
      border-radius: 50%;
      border: 3px solid transparent;
      border-top-color: #ffe3a3;
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
      border-top-color: #7fb56a;
      animation: ${spin} 1.5s linear infinite;
   }
`

const Logo = styled.div`
   position: absolute;
   top: 50%;
   left: 50%;
   display: flex;
   align-items: center;
   justify-content: center;
   width: 100px;
   height: 100px;
   transform: translate(-50%, -50%);

   svg path {
      fill: #fff4ce;
   }
`

const LoadingText = styled.div`
   width: 100%;
   padding-top: 20px;
   font-weight: bold;
   color: #fff4ce;
   animation: ${forestText} 10s ease-in-out infinite;
`

const LoadingDetail = styled.div`
   display: flex;
   justify-content: center;
   gap: 12px;
   margin-top: 8px;
   color: rgba(255, 244, 206, 0.84);
   font-size: 13px;
   font-weight: 500;
`

const CurrentItem = styled.div`
   max-width: 100%;
   margin: 8px auto 0;
   overflow: hidden;
   color: rgba(229, 238, 193, 0.76);
   font-size: 12px;
   font-weight: 500;
   text-overflow: ellipsis;
   white-space: nowrap;
`

const ProgressTrack = styled.div`
   box-sizing: border-box;
   width: min(260px, 100%);
   height: 6px;
   margin: 12px auto 0;
   overflow: hidden;
   border: 1px solid rgba(255, 227, 163, 0.36);
   border-radius: 999px;
   background: rgba(7, 17, 13, 0.72);
`

const ProgressFill = styled.div<{ $progress: number }>`
   width: ${({ $progress }) => `${$progress}%`};
   height: 100%;
   border-radius: inherit;
   background: linear-gradient(90deg, #6a8f49, #d8e8a4, #ffe3a3);
   transition: width 220ms ease;
`

const ErrorText = styled.div`
   margin-top: 8px;
   color: #ffc49c;
   font-size: 12px;
   font-weight: 600;
`

const loadingPhases = [
   'Waking the forest floor',
   'Growing grass blades',
   'Placing trees',
   'Settling mushrooms',
   'Opening the clearing',
]

function getCurrentAssetName(item?: string) {
   if (!item) {
      return 'Preparing scene'
   }

   return item.split('/').pop()?.split('?')[0] || item
}

export default function Loader() {
   const { active, errors, item, loaded, progress, total } = useLoadingProgress()
   const isComplete = !active || (total > 0 && loaded >= total)
   const barProgress = isComplete ? 100 : Math.max(0, Math.min(99.9, progress || 0))
   const displayedProgress = isComplete ? 100 : Math.max(0, Math.min(99, Math.floor(progress || 0)))
   const phaseIndex = Math.min(loadingPhases.length - 1, Math.floor((barProgress / 100) * loadingPhases.length))
   const phase = active ? loadingPhases[phaseIndex] : 'Forest ready'
   const assetCount = total > 0 ? `${loaded}/${total} assets` : `${loaded} assets`
   const currentItem = active ? getCurrentAssetName(item) : 'Scene loaded'

   return (
      <Html fullscreen>
         <Screen>
            <ForestBG />
            <Content>
               <SpinnerBox>
                  <LoaderWrapper />
                  <Logo>
                     <svg
                        id="Layer_1"
                        height="36"
                        data-name="Layer 1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 650.92 312.12"
                     >
                        <path
                           d="M398.05,323.6c8.3,0,10-2.78,5.88-9.91q-83.74-146-167.45-292.07c-4-7-9.47-10.08-17.46-10-41,.12-82,0-123,0-8,0-9.62,2.87-5.63,9.78q45.89,79.35,91.8,158.67,28.4,49.06,56.8,98.13c3,5.14,2.5,6-3.29,6-7.83,0-15.68-.32-23.5,0-4.85.21-7.41-1.77-9.76-5.86q-39.16-68.22-78.66-136.27c-3.76-6.5-7.29-6.47-11.1.13Q81.6,196.06,50.54,249.94,32,282.18,13.36,314.42c-1.68,2.9-3.21,5.95.45,8.24,1.52.95,3.81.9,5.76.91Z"
                           transform="translate(-11.57 -11.57)"
                        />
                        <path
                           d="M275.3,11.61c-7.3,0-9.11,3.05-5.54,9.27Q317.13,103.41,364.5,186q36.15,63,72.18,126.14c4.5,7.94,10.33,11.66,19.67,11.59,40.5-.28,81-.09,121.5-.08,8.24,0,9.91-2.84,5.77-10q-45.25-78.27-90.57-156.51Q464,106.94,435,56.79c-2.72-4.7-2.19-5.69,3.24-5.73,7.5,0,15,.49,22.49-.09,6-.45,8.85,2.18,11.62,7q38.79,67.58,78,135c4,6.87,7.3,6.78,11.32-.17q49.27-85.47,98.57-170.93c4.3-7.46,2.72-10.23-5.89-10.23Z"
                           transform="translate(-11.57 -11.57)"
                        />
                     </svg>
                  </Logo>
               </SpinnerBox>
               <LoadingText>
                  {phase}
                  <LoadingDetail>
                     <span>{displayedProgress}%</span>
                     <span>{assetCount}</span>
                  </LoadingDetail>
                  <ProgressTrack>
                     <ProgressFill $progress={barProgress} />
                  </ProgressTrack>
                  <CurrentItem title={currentItem}>{currentItem}</CurrentItem>
                  {errors.length > 0 && (
                     <ErrorText>
                        {errors.length} asset issue{errors.length === 1 ? '' : 's'} detected
                     </ErrorText>
                  )}
               </LoadingText>
            </Content>
         </Screen>
      </Html>
   )
}
