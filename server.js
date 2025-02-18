import express from 'express'
import { Document, Packer, PageMargin, PageSize, Paragraph, TextRun, BorderStyle, ExternalHyperlink } from 'docx'
import fs from 'fs'
import crypto from 'crypto'
const app = express()


const generateDocInFolder = (doc, filePath) => {
    Packer.toBuffer(doc).then((buffer) => {
        if (!fs.existsSync(filePath)) {
            fs.mkdirSync(filePath)
        }
        const str = crypto.randomBytes(8).toString('hex')
        fs.writeFileSync(filePath + `Resume-${str}.docx`, buffer)
    })
}

const generateDoc = () => {
    const info = {
        name: "Mohammed Bilal",
        designation: "Senior Systems Engineer",
        location: "Hyderabad",
        phno: "+91 7981266312",
        email: "sk.bilal.md@gmail.com",
        linkedIn: "https://www.linkedin.com/in/shaik-mohammed-bilal-2b4472155/",
        objective: "Experienced Full Stack Developer with over 3 years of experience specializing in MERN stack development and expertise in Java-based frameworks such as Spring MVC and Spring Boot. Skilled in building scalable web applications using React.js with Redux for state management. Proven track record of delivering high-quality, user-centric solutions and collaborating effectively within cross-functional teams.",
        experience: [
            {
                companyName: 'Infosys',
                designation: "Senior Systems Engineer",
                timeRange: '2023 - Present',
                location: "Hyderabad",
                clientName: "Bank Of America",
                points: [
                    'Developed a scalable banking application using Spring Boot with a microservices architecture, ensuring modularity and performance.',
                    'Implemented secure authentication and access control using JWT, Spring Security, and OAuth2 for API security and compliance.',
                    'Developed a secure payment gateway solution, ensuring reliable transaction processing and adherence to financial regulations.',
                    'Optimized database operations using MySQL, Postgres, and Redis for caching, enhancing performance and efficiency.',
                    'Built responsive frontends with React.js and Redux, and set up CI/CD pipelines with Jenkins and Docker for consistent deployments.',
                    'Monitored system performance and implemented logging using the ELK stack and Prometheus to ensure application stability and proactive issue resolution.',
                ]
            },
            {
                companyName: 'Infosys',
                designation: "Systems Engineer",
                timeRange: '2021 - 2023',
                location: "Hyderabad",
                clientName: "Rainforest Foundation",
                points: [
                    'Developed a responsive e-commerce application using the MERN stack (MongoDB, Express.js, React, Node.js), enabling a seamless shopping experience and increasing sales by 40%.',
                    'Implemented a real-time chat feature for a social networking platform with Socket.io, enhancing user engagement and communication.',
                    'Built an admin dashboard with user analytics and CRUD operations, improving operational efficiency and allowing real-time data management.',
                    'Optimized application performance through code refactoring and effective use of Redux for state management, reducing load times by 20%.'
                ]
            },

        ],
        skills: {

        }
    }


    const doc = new Document({
        sections: [

            {
                properties: {

                    page: {
                        // size: new PageSize(11906, 16838), // A4 size in twips
                        margin: {
                            top: 500, left: 500, bottom: 500, right: 500
                        }, // 1-inch margi

                        borders: {
                            pageBorderBottom: {
                                style: BorderStyle.SINGLE,
                                space: 200,
                                size: 2 * 8, //2pt;
                                color: '000000',
                            },
                            pageBorderLeft: {
                                style: BorderStyle.SINGLE,
                                space: 200,
                                size: 1 * 8, //1pt;
                                color: '000000',
                            },
                            pageBorderRight: {
                                style: BorderStyle.SINGLE,
                                space: 200,
                                size: 1 * 8, //1pt;
                                color: '000000',
                            },
                            pageBorderTop: {
                                style: BorderStyle.SINGLE,
                                space: 200,
                                size: 1 * 8, //1pt;
                                color: '000000',
                            },

                            pageBorders: {
                                display: "allPages", //https://docx.js.org/api/enums/PageBorderDisplay.html
                                offsetFrom: "text", //https://docx.js.org/api/enums/PageBorderOffsetFrom.html
                                zOrder: "front" //https://docx.js.org/api/enums/PageBorderZOrder.html
                            }
                        }
                    },

                },

                children: [
                    new Paragraph({
                        alignment: 'left',
                        children: [
                            new TextRun({
                                text: 'Mohammed Bilal',
                                font: 'Calibri',
                                bold: true,
                                size: 45
                            }),
                        ]
                    }),
                    new Paragraph({
                        alignment: 'left',
                        spacing: {
                            before: 140,
                        },
                        children: [

                            new TextRun({
                                text: 'SENIOR SYSTEM ENGINEER',
                                font: 'Calibri (Body)',
                                subScript: true,
                                size: 28
                            }),
                        ]
                    }),
                    new Paragraph({
                        alignment: 'left',
                        spacing: {
                            before: 200,
                        },
                        children: [

                            new TextRun({
                                bold: true,
                                text: info.location,
                                font: 'Calibri',
                                size: 20,
                            }),
                            new TextRun({
                                text: ' | ',
                                font: 'Calibri',
                                size: 22,
                            }),
                            new TextRun({
                                bold: true,
                                text: info.phno,
                                font: 'Calibri',
                                size: 20,
                            }),
                            new TextRun({
                                text: ' | ',
                                font: 'Calibri',
                                size: 22,
                            }),
                            // new TextRun({
                            //     bold: true,
                            //     text: info.email,
                            //     hyperlink: 'mailTo:' + info.email,
                            //     font: 'Calibri',
                            //     size: 20,
                            // }),
                            new ExternalHyperlink({
                                children: [
                                    new TextRun({
                                        text: info.email,
                                        style: "Hyperlink",
                                        size: 20,
                                        font: 'Calibri'
                                    }),
                                ],
                                link: "mailTo:" + info.email,
                            }),
                            new TextRun({
                                text: ' | ',
                                font: 'Calibri',
                                size: 22,
                            }),
                            new ExternalHyperlink({
                                children: [
                                    new TextRun({
                                        text: "LinkedIn",
                                        style: "Hyperlink",
                                        size: 20,
                                        font: 'Calibri'
                                    }),
                                ],
                                link: info.linkedIn,
                            }),
                        ]
                    }),
                    new Paragraph({
                        border: {
                            bottom: {
                                style: 'single',
                                size: 2,
                                color: '#000000',
                                space: 10
                            }
                        },
                        children: [

                        ]
                    }),
                    new Paragraph({
                        alignment: 'left',
                        spacing: {
                            before: 200,
                        },
                        children: [
                            new TextRun({
                                bold: true,
                                font: 'Calibri',
                                text: 'Objective',
                                size: 16 * 2
                            })
                        ]
                    }),
                    new Paragraph({
                        spacing: {
                            before: 200,
                            line: 270
                            
                        },
                        alignment: 'both',

                        children: [
                            new TextRun({
                                characterSpacing: 100,
                                text: 'Motivated MERN Stack Developer with a strong background and 3+ years of Experience in creating scalable and high-performance web applications. Skilled in both frontend and backend development, with a proven track record in optimizing application performance and implementing secure authentication solutions. Looking to contribute to a forward-thinking team and drive impactful software development projects.',
                                size: 22,

                            })
                        ]
                    }),
                    new Paragraph({
                        border: {
                            bottom: {
                                style: 'single',
                                size: 2,
                                color: '#000000',
                                space: 10
                            }
                        },
                        children: [

                        ]
                    }),
                    new Paragraph({
                        alignment: 'left',
                        spacing: {
                            before: 200,
                        },
                        children: [
                            new TextRun({
                                bold: true,
                                font: 'Calibri',
                                text: 'Experience',
                                size: 16 * 2
                            })
                        ]
                    }),
                    ...info.experience.map((exp) => {
                        return new Paragraph({
                            alignment: 'left',
                            spacing: {
                                before: 200,
                                line: 270
                            },
                            children: [
                                new TextRun({
                                    bold: true,
                                    text: exp.companyName,
                                    font: 'Calibri',
                                    characterSpacing: 2,
                                    size: 14 * 2,
                                }),
                                new TextRun({
                                    text: ' | ',
                                    font: 'Calibri',
                                    size: 22,
                                }),
                                new TextRun({
                                    bold: true,
                                    text: exp.timeRange,
                                    font: 'Calibri',
                                    characterSpacing: 2,
                                    size: 14 * 2,
                                }),
                                new TextRun({
                                    text: ' | ',
                                    font: 'Calibri',
                                    size: 22,
                                }),
                                new TextRun({
                                    bold: true,
                                    text: exp.location,
                                    font: 'Calibri',
                                    characterSpacing: 2,
                                    size: 14 * 2,
                                }),
                            ]

                        })

                    })

                ]
            }
        ]
    })
    generateDocInFolder(doc, './generated/')
}

app.listen(5000, () => {
    console.log("Started Server on 5000...")
    generateDoc()
})