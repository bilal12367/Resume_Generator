import React from 'react'
import './styles.css'
import Ball from '../../app/components/Ball'
import Card from '../../app/components/Card'
import GlowDot from '../../app/components/GlowDot'
import Button from '../../app/components/Button'
import HR from '../../app/components/HR'
import profile from '../../assets/images/profile_2.png'
import Card3D from '../../app/components/Card3D'


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

const Home = () => {
  const theme = {
    primary: '#ff3b30',
    grey: 'rgba(255,255,255,0.4)'
  }
  return (
    <React.Fragment>
      <div className='root-cont'>
        <Ball
          borderRadius='50%'
          color='green'
          height={100}
          width={100}
          style={{
            right: '20%'
          }} />
        <Ball
          borderRadius='10%'
          color='red'
          height={300}
          width={300}
          style={{
            left: '20%',
            top: '23%',
            transform: 'rotate(45deg)'
          }} />

        <Ball
          borderRadius='50%'
          color='blue'
          height={220}
          width={220}
          style={{
            right: '10%',
            top: '30%',
            transform: 'rotate(45deg)'
          }} />

        {/* Subtle Grid Background Pattern */}
        <div className='grid-background' />

        <div className='home-cont  position-relative w-100' style={{ zIndex: 1 }}>

          <div className='padded '>
            {/* Sticky Bar */}
            <div className='sticky-bar'>
              <Card style={{ borderRadius: '40px' }}>
                <div className='d-flex flex-row align-items-center justify-content-betweengap-1 nav-cont'>
                  <div className='nav-head gap-3 d-flex flex-row align-items-center '>
                    <GlowDot
                      color={theme.primary}
                      glowIntensity='7px'
                      size='6px'
                      speed='1.4s'
                    />
                    <span>MB</span>
                  </div>
                  <div className='nav-link'>
                    <span>About</span>
                  </div>
                  <div className='nav-link'>
                    <span>Work</span>
                  </div>
                  <div className='nav-link'>
                    <span>Stack</span>
                  </div>
                  <div className='nav-link'>
                    <span>Resume</span>
                  </div>
                </div>
              </Card>

            </div>

            {/* Home Content */}
            <div className='home-content vh-100 d-flex flex-column gap-4 align-items-start'>
              <Card style={{ borderRadius: 40 }} className='d-flex flex-row gap-3 align-items-center'>
                <GlowDot color={theme.primary} />
                <span style={{ fontSize: 10, letterSpacing: 2 }}>AVAILALBE FOR SELECT WORK</span>
                <div>·</div>
                <span style={{ fontSize: 10 }}>2026</span>
              </Card>

              <div className='d-flex flex-row align-items-center'>
                <span style={{ letterSpacing: 2, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>HYDERABAD, INDIA · 5 YEARS SHIPPING AI</span>
              </div>

              <div className='d-flex flex-column'>
                <span className='unbounded1' style={{ fontSize: 48, fontWeight: 'bold' }}>
                  MOHAMMED
                </span>
                <span className='unbounded1' style={{ fontSize: 48, fontWeight: 'bold' }}>
                  BILAL
                </span>
              </div>

              <div className='d-flex align-items-center gap-3'>
                <span
                  className='ibmplex'
                  style={{ fontSize: 35, fontWeight: 300 }}>
                  AI DEVELOPER
                </span>
                <div style={{ width: 30, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
                <div style={{ color: 'var(--primary-color)' }} className='d-flex gap-2'>
                  <span>RAG</span>
                  <span>·</span>
                  <span>LLM</span>
                  <span>·</span>
                  <span>CLASSIFICATION</span>
                </div>
              </div>

              <div className='d-flex flex-column'>
                <span>I build intelligent systems that read, reason, and respond — shipping</span>
                <span> production-grade RAG pipelines, conversational agents, and classification</span>
                <span> models.</span>
              </div>

              <div className='d-flex gap-4' style={{ marginTop: '5%' }}>
                <Button style={{ fontWeight: 500 }} bgColor={theme.primary} className='ibmplex' text="Download Resume" icon={<DownloadIcon />} />
                <Button variant='card' style={{ fontWeight: 500, borderRadius: 40 }} bgColor={theme.primary} className='ibmplex' text="View Projects" icon={<GeminiIcon color={theme.primary} />} />
              </div>

              <div style={{ marginTop: 40, height: 1, width: '100%', backgroundColor: 'rgba(255,255,255,0.2)' }} />

              <div className='w-100 d-flex justify-content-between'>
                <div className='d-flex flex-column justify-content-start'>
                  <span style={{ fontSize: 46 }}>
                    05
                  </span>
                  <span style={{ fontSize: 13, color: theme.grey }}>
                    Years Shipped
                  </span>

                </div>
                <div className='d-flex flex-column justify-content-start'>
                  <span style={{ fontSize: 46 }}>
                    14
                  </span>
                  <span style={{ fontSize: 13, color: theme.grey }}>
                    Models Deployed
                  </span>

                </div>
                <div className='d-flex flex-column justify-content-start'>
                  <span style={{ fontSize: 46 }}>
                    06
                  </span>
                  <span style={{ fontSize: 13, color: theme.grey }}>
                    Projects Worked
                  </span>

                </div>
                <div className='d-flex flex-column justify-content-start'>
                  <span style={{ fontSize: 46 }}>
                    12M+
                  </span>
                  <span style={{ fontSize: 13, color: theme.grey }}>
                    Documents Indexed
                  </span>

                </div>
              </div>


              {/* Scroll Down animation */}
              <div className='w-100 scroll-down d-flex flex-column align-items-center'>
                <span style={{ fontSize: 12, color: theme.grey }}>Scroll Down</span>
                {/* <DownIcon /> */}
                <div>
                  <DownIcon color={'rgba(255,255,255,0.2)'} />
                </div>
              </div>

              <section className="about-container">
                <div className="about-content-wrapper">

                  {/* Left Side: Text and Cards */}
                  <div className="about-text-column">
                    <header className="about-header">
                      <span className="section-number">01 — ABOUT</span>
                      <h2 className="main-title">
                        Building AI that <br />
                        <span className="title-italic">actually ships.</span>
                      </h2>
                    </header>

                    <div className="bio-text">
                      <p className="primary-bio">
                        Over the last five years I've designed and shipped AI systems used by
                        teams across fintech, healthcare, and legal — turning messy documents
                        into structured knowledge, building chatbots that actually hold context,
                        and deploying classification models that hold up under production load.
                        I care about latency, grounding, and evaluation — not demos.
                      </p>
                      <p className="secondary-bio">
                        Currently exploring agentic workflows, evaluation frameworks, and
                        making retrieval faster without giving up on quality.
                      </p>
                    </div>

                    <div className="stats-grid">
                      <div className="stat-card">
                        <span className="stat-label">FOCUS</span>
                        <span className="stat-value">RAG Systems</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">ALSO</span>
                        <span className="stat-value">Conversational AI</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">AND</span>
                        <span className="stat-value">Classification</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Portrait */}
                  <div className="about-image-column">
                    <div className="portrait-wrapper">
                      <img
                        src={profile}
                        alt="Mohammed Bilal"
                        width={100}
                        height={100}
                        className="portrait-img"
                      />
                      <div className="image-overlay-gradient"></div>
                      <div className="portrait-footer">
                        <div className="location-info">
                          <span className="location-label">BASED IN</span>
                          <span className="location-name">Hyderabad, India</span>
                        </div>
                        <div className="initials-circle">AM</div>
                      </div>
                    </div>
                    <div className="red-glow-bg"></div>
                  </div>

                </div>
              </section>

              <section className="projects-cont w-100">
                <div className="projects-content-wrapper">

                  {/* Left Side: Text and Cards */}
                  <div className="projects-header">
                    <header className="about-header d-flex flex-row justify-content-between align-items-center w-100">
                      <div>
                        <span className="section-number">02 — Projects Worked</span>
                        <h2 className="main-title">
                          Six Projects in. <br />
                          <span className="title-italic">Production</span>
                        </h2>
                      </div>

                      <div className='subtitle-column'>
                        <span>A curated subset — RAG systems, chatbots, and classifiers that survived real users, real latency budgets, and real evals.</span>
                      </div>
                    </header>
                  </div>
                  {/* Projects */}
                  <div className='row'>
                    <div className='col-md-6'>
                      <Card3D style={{
                        backgroundColor: 'rgba(255,255,255,0.2)',
                        // padding: '20px 20px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        width: '100%',
                        margin: 20,
                        borderRadius: 10,
                        border: `1px solid ${theme.primary}`
                      }} maxRotation={10}>
                        <div className='position-relative'>
                          <div className='image-overlay-gradient' />
                          <img
                            src='https://images.pexels.com/photos/30547618/pexels-photo-30547618.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940'
                            alt='project1'
                            style={{
                              objectFit: 'cover'
                            }}
                            width='100%'
                            height='400px'
                          />
                        </div>
                        <div className='project-card-details position-relative d-flex flex-column'>
                          <div className='project-card-button position-absolute' style={{ right: 20, top: 10, padding: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)' }}>
                            <RightIcon size={20} color={'white'} />
                          </div>
                          <div className='d-flex flex-column gap-3 w-100 justify-content-between'>
                            <span className='unbounded1' style={{ fontSize: 20, fontWeight: 'bold' }}>Intenet Classifier V3</span>
                            <span className='ibmplex' style={{ fontSize: 16, color: theme.grey }}>
                              Fine-tuned transformer-based intent classifier across 120 labels with active learning loop. Cut misroutes by 38% in prod.
                            </span>

                            <div className='d-flex gap-2 flex-wrap'>
                              <div className='d-flex chip'>
                                PYTORCH
                              </div>
                              <div className='d-flex chip'>
                                DISTILBERT
                              </div>
                              <div className='d-flex chip'>
                                PRODIGY
                              </div>
                            </div>
                          </div>
                        </div>

                      </Card3D>
                    </div>
                    <div className='col-md-6'></div>

                  </div>
                </div>
              </section>
            </div>


          </div>

        </div>
      </div>
    </React.Fragment>
  )
}

export default Home