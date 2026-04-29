import React from 'react'
import './styles.css'
import Ball from '../../app/components/Ball'
import Card from '../../app/components/Card'
import GlowDot from '../../app/components/GlowDot'
import Button from '../../app/components/Button'
import profile from '../../assets/images/profile_2.png'
import Card3D from '../../app/components/Card3D'
import { DownIcon, DownloadIcon, GeminiIcon, RightIcon } from '../../app/svg/SVG'


const NavLink = ({ title }: { title: string }) => (
  <div className='nav-link'>
    <span>{title}</span>
  </div>
);

const StatItem = ({ number, label }: { number: string, label: string }) => (
  <div className='stat-column'>
    <span className="stat-number">{number}</span>
    <span className="stat-text">{label}</span>
  </div>
);

interface ProjectCardProps {
  title: string;
  description: string;
  imageSrc: string;
  tags: string[];
}

const ProjectCard = ({ title, description, imageSrc, tags }: ProjectCardProps) => (
  <Card3D className="project-card-wrapper" maxRotation={10}>
    <div className='position-relative'>
      <div className='image-overlay-gradient' />
      <img src={imageSrc} alt={title} className="project-card-image" />
    </div>
    <div className='project-card-details position-relative d-flex flex-column'>
      <div className='project-card-btn position-absolute'>
        <RightIcon size={20} color={'white'} />
      </div>
      <div className='d-flex flex-column gap-3 w-100 justify-content-between'>
        <span className='unbounded1 project-title'>{title}</span>
        <span className='ibmplex project-desc'>{description}</span>
        <div className='d-flex gap-2 flex-wrap'>
          {tags.map(tag => <div key={tag} className='d-flex chip'>{tag}</div>)}
        </div>
      </div>
    </div>
  </Card3D>
);

const Home = () => {
  const theme = {
    primary: '#ff3b30',
    grey: 'rgba(255,255,255,0.4)'
  }
  return (
    <React.Fragment>
      <div className='root-cont'>
        <Ball borderRadius='50%' color='green' height={100} width={100} className='ball-1' />
        <Ball borderRadius='10%' color='red' height={300} width={300} className='ball-2' />
        <Ball borderRadius='50%' color='blue' height={220} width={220} className='ball-3' />

        {/* Subtle Grid Background Pattern */}
        <div className='grid-background' />

        <div className='home-cont  position-relative w-100' style={{ zIndex: 1 }}>

          <div className='padded '>
            {/* Sticky Bar */}
            <div className='sticky-bar'>
              <Card className='sticky-nav-card'>
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
                  <NavLink title="About" />
                  <NavLink title="Work" />
                  <NavLink title="Stack" />
                  <NavLink title="Resume" />
                </div>
              </Card>

            </div>

            {/* Home Content */}
            <div className='home-content vh-100 d-flex flex-column gap-4 align-items-start'>
              <Card style={{borderRadius: 40}} className='d-flex flex-row gap-3 align-items-center available-badge'>
                <GlowDot color={theme.primary} />
                <span className='available-badge-text'>AVAILABLE FOR SELECT WORK</span>
                <div>·</div>
                <span>2026</span>
              </Card>

              <div className='d-flex flex-row align-items-center'>
                <span className='hero-subtitle'>HYDERABAD, INDIA · 5 YEARS SHIPPING AI</span>
              </div>

              <div className='d-flex flex-column'>
                <span className='unbounded1 hero-name'>MOHAMMED</span>
                <span className='unbounded1 hero-name'>BILAL</span>
              </div>

              <div className='d-flex align-items-center gap-3'>
                <span className='ibmplex hero-role'>AI DEVELOPER</span>
                <div className='hero-role-divider'></div>
                <div className='hero-skills d-flex gap-2'>
                  <span>RAG</span>
                  <span>·</span>
                  <span>LLM</span>
                  <span>·</span>
                  <span>CLASSIFICATION</span>
                </div>
              </div>

              <div className='d-flex flex-column hero-desc'>
                <span>I build intelligent systems that read, reason, and respond — shipping</span>
                <span> production-grade RAG pipelines, conversational agents, and classification</span>
                <span> models.</span>
              </div>

              <div className='d-flex gap-4' style={{ marginTop: '5%' }}>
                <Button bgColor={theme.primary} className='ibmplex hero-btn' text="Download Resume" icon={<DownloadIcon />} />
                <Button variant='card' bgColor={theme.primary} className='ibmplex hero-btn hero-btn-rounded' text="View Projects" icon={<GeminiIcon color={theme.primary} />} />
              </div>
              <div className='w-100'>
                <div className='section-divider' />
              </div>
              <div className='w-100 d-flex justify-content-between'>
                <StatItem number="05" label="Years Shipped" />
                <StatItem number="14" label="Models Deployed" />
                <StatItem number="06" label="Projects Worked" />
                <StatItem number="12M+" label="Documents Indexed" />
              </div>


              {/* Scroll Down animation */}
              <div className='w-100 scroll-down d-flex flex-column align-items-center'>
                <span className='scroll-down-text'>Scroll Down</span>
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

              <section className="projects-cont vh-100 w-100">
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
                  <div className='d-flex flex-row gap-5 p-4'>
                    <div className=''>
                      <ProjectCard 
                        title="Intenet Classifier V3"
                        description="Fine-tuned transformer-based intent classifier across 120 labels with active learning loop. Cut misroutes by 38% in prod."
                        imageSrc="https://images.pexels.com/photos/30547618/pexels-photo-30547618.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
                        tags={['PYTORCH', 'DISTILBERT', 'PRODIGY']}
                      />
                    </div>
                    <div className=''>
                      <ProjectCard 
                        title="Intenet Classifier V3"
                        description="Fine-tuned transformer-based intent classifier across 120 labels with active learning loop. Cut misroutes by 38% in prod."
                        imageSrc="https://images.pexels.com/photos/29450016/pexels-photo-29450016.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
                        tags={['PYTORCH', 'DISTILBERT', 'PRODIGY']}
                      />
                    </div>

                  </div>
                  <div className='d-flex flex-row gap-5 p-4'>
                    <div className=''>
                      <ProjectCard 
                        title="Intenet Classifier V3"
                        description="Fine-tuned transformer-based intent classifier across 120 labels with active learning loop. Cut misroutes by 38% in prod."
                        imageSrc="https://images.unsplash.com/photo-1655720828018-edd2daec9349?w=940&q=85&fm=jpg"
                        tags={['PYTORCH', 'DISTILBERT', 'PRODIGY']}
                      />
                    </div>
                    <div className=''>
                      <ProjectCard 
                        title="Intenet Classifier V3"
                        description="Fine-tuned transformer-based intent classifier across 120 labels with active learning loop. Cut misroutes by 38% in prod."
                        imageSrc="https://images.pexels.com/photos/9783812/pexels-photo-9783812.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
                        tags={['PYTORCH', 'DISTILBERT', 'PRODIGY']}
                      />
                    </div>

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