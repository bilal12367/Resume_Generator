
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const GeminiIcon = ({ color = 'black' }) => {
  return (<svg xmlns="http://www.w3.org/2000/svg" fill={color} fill-rule="evenodd" height="1em" viewBox="0 0 24 24" width="1em"><title>Gemini</title><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" /></svg>)
}

const DownIcon = ({ color = 'black' }) => {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill={color} width="20px" height="20px" viewBox="0 0 24 24">
      <path d="M11 18.5858L7.70711 15.2929C7.31658 14.9024 6.68342 14.9024 6.29289 15.2929C5.90237 15.6834 5.90237 16.3166 6.29289 16.7071L11.2929 21.7071C11.6834 22.0976 12.3166 22.0976 12.7071 21.7071L17.7071 16.7071C18.0976 16.3166 18.0976 15.6834 17.7071 15.2929C17.3166 14.9024 16.6834 14.9024 16.2929 15.2929L13 18.5858L13 3C13 2.44772 12.5523 2 12 2C11.4477 2 11 2.44772 11 3L11 18.5858Z" fill={color} />
    </svg>
  )
}

const RightIcon = ({ size = 60, color = 'black' }) => {
  return (
    <svg width={size + 'px'} height={size + 'px'} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12H20M20 12L14 6M20 12L14 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    // <svg xmlns="http://www.w3.org/2000/svg" width={size+'px'} height={size+'px'} viewBox="-19.04 0 75.804 75.804">
    //   <g id="Group_65" data-name="Group 65" transform="translate(-831.568 -384.448)">
    //     <path id="Path_57" data-name="Path 57" d="M833.068,460.252a1.5,1.5,0,0,1-1.061-2.561l33.557-33.56a2.53,2.53,0,0,0,0-3.564l-33.557-33.558a1.5,1.5,0,0,1,2.122-2.121l33.556,33.558a5.53,5.53,0,0,1,0,7.807l-33.557,33.56A1.5,1.5,0,0,1,833.068,460.252Z" fill={color} />
    //   </g>
    // </svg>
  )
}


export { DownloadIcon, GeminiIcon, DownIcon, RightIcon }