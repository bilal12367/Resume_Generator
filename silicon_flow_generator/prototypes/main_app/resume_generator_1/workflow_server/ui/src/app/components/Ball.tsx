import React, { CSSProperties } from 'react'

interface BallProps {
  height: number
  width: number
  color: string
  borderRadius: string
  className?: string
  style?: CSSProperties
}


const Ball = (props: BallProps) => {
  return (
    <div 
          className={props.className}
          style={{
            borderRadius: props.borderRadius,
            backgroundColor: props.color,
            position: 'absolute',
            width: props.width,
            height: props.height,
            ...props.style
          }} 
        ></div>
  )
}

export default Ball