import express from 'express'
import { Document, Packer, PageMargin, PageSize, Paragraph, TextRun, BorderStyle, ExternalHyperlink, Table, Tab, TableRow } from 'docx'
import fs from 'fs'
import crypto from 'crypto'
const app = express()
import userData from './user_data.json'

const generateDocInFolder = (doc: any, filePath: string) => {
    Packer.toBuffer(doc).then((buffer) => {
        if (!fs.existsSync(filePath)) {
            fs.mkdirSync(filePath)
        }
        const str = crypto.randomBytes(8).toString('hex')
        fs.writeFileSync(filePath + `Resume-${str}.docx`, buffer)
    })
}

const styles = {
    pageMargin: {
        top: 500, left: 500, bottom: 500, right: 500
    }, // 1-inch margi
    pageBorder: {
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
    },
    nameFontStyle: {
        font: 'Calibri',
        bold: true,
        size: 45
    },
    designationFontStyle: {
        font: 'Calibri (Body)',
        subScript: true,
        size: 28
    }
}

const text = (text: string, size: number = 20, bold: boolean = false, characterSpacing: number = 15, italic: boolean = false ) => {}

const getExpDetails = (exper: typeof userData.experience) => {
    let arr: any = []
    exper.forEach(exp => {
        arr.push(new Paragraph({
            spacing: {before: 300},
            alignment: 'left',
            children: [
                new TextRun({
                    bold: true,
                    text: exp.clientName,
                    characterSpacing: 20,
                    font: 'Calibri',
                    size: 25
                }),
                new TextRun({
                    size: 20,
                    text: ' | '
                }),
                new TextRun({
                    bold: true,
                    text: exp.designation,
                    characterSpacing: 20,
                    font: 'Calibri',
                    size: 25
                })
            ]
        }))
        // exp.points.forEach(pt => {
        //     arr.push(
        //         new Paragraph({
        //             alignment: 'both',
                    
        //             spacing: {
        //                 before: 120,
        //             },
        //             bullet: {
        //                 level: 0
        //             },
        //             children: [
        //                 new TextRun({
        //                     text: pt,
        //                     size:22,
        //                     characterSpacing: 20,

        //                 })
        //             ]
        //         })
        //     )
        // })
    })
    return arr
}
const generateDoc = () => {
    const info = userData


    const doc = new Document({
        sections: [

            {
                properties: {

                    page: {
                        // size: new PageSize(11906, 16838), // A4 size in twips
                        margin: styles.pageMargin,

                        borders: styles.pageBorder as any
                    },

                },

                children: [
                    new Paragraph({
                        alignment: 'left',
                        children: [
                            new TextRun({
                                text: info.name,
                                ...styles.nameFontStyle
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
                                text: info.designation,
                                ...styles.designationFontStyle
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
                                characterSpacing: 20,
                                text: info.objective,
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
                    // ...getExpDetails(info.experience)
                    ,
                    new Table({
                        rows: [
                            ...info.experience.map(exp => {
                                return new TableRow({
                                    children: [
                                    ]
                                })
                            })
                        ]
                    })
                    
                    // ...info.experience.map((exp) => {
                        
                    //     return new Paragraph({
                    //         alignment: 'left',
                    //         spacing: {
                    //             before: 200,
                    //             line: 270
                    //         },
                    //         children: [
                    //             new TextRun({
                    //                 bold: true,
                    //                 text: exp.companyName,
                    //                 font: 'Calibri',
                    //                 characterSpacing: 2,
                    //                 size: 14 * 2,
                    //             }),
                    //             new TextRun({
                    //                 text: ' | ',
                    //                 font: 'Calibri',
                    //                 size: 22,
                    //             }),
                    //             new TextRun({
                    //                 bold: true,
                    //                 text: exp.timeRange,
                    //                 font: 'Calibri',
                    //                 characterSpacing: 2,
                    //                 size: 14 * 2,
                    //             }),
                    //             new TextRun({
                    //                 text: ' | ',
                    //                 font: 'Calibri',
                    //                 size: 22,
                    //             }),
                    //             new TextRun({
                    //                 bold: true,
                    //                 text: exp.location,
                    //                 font: 'Calibri',
                    //                 characterSpacing: 2,
                    //                 size: 14 * 2,
                    //             }),
                                
                                
                    //         ]

                    //     })

                    // })

                ]
            }
        ]
    })
    generateDocInFolder(doc, './generated/')
}

app.listen(5000, () => {
    console.log("Started Server on 5000...")
    // generateDoc()
})