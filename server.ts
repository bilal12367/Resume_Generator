import express from 'express'
import { Document, Packer, PageMargin, PageSize, Paragraph, TextRun, BorderStyle, ExternalHyperlink, Table, Tab, TableRow, TableCell, TableBorders, WidthType, PageBreak } from 'docx'
import fs from 'fs'
import crypto from 'crypto'
const app = express()
import path from 'path'
import userData from './user_data.json'

function deleteFilesInDirectory(dirPath: string) {
    // Check if the directory exists
    if (fs.existsSync(dirPath)) {
        // Read all files in the directory
        const files = fs.readdirSync(dirPath);

        files.forEach(file => {
            const filePath = path.join(dirPath, file);

            // Check if the file is a regular file (not a directory)
            if (fs.lstatSync(filePath).isFile()) {
                // Delete the file
                fs.unlinkSync(filePath);
                console.log(`Deleted: ${filePath}`);
            }
        });
    } else {
        console.log("Directory does not exist.");
    }
}

const generateDocInFolder = (doc: any, filePath: string) => {
    deleteFilesInDirectory(filePath)
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
    tableCellNoBorder: {
        top: { style: BorderStyle.NONE, space: 100 },
        bottom: { style: BorderStyle.NONE, space: 100 },
        left: { style: BorderStyle.NONE, space: 100 },
        right: { style: BorderStyle.NONE, space: 100 },
    },
    tableCellNoBorderNoSpace: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
    },
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

type AlignmentType = "start" | "center" | "end" | "both" | "mediumKashida" | "distribute" | "numTab" | "highKashida" | "lowKashida" | "thaiDistribute" | "left" | "right" | undefined;
type TextOptions = {
    text: string;
    size?: number;
    bold?: boolean;
    characterSpacing?: number;
    font?: string;
    spaceBefore?: number;
    alignment?: AlignmentType;
    lineHeight?: number;
    paragraph?: boolean
};

const Text = ({
    text,
    size = 20,
    bold = false,
    characterSpacing = 15,
    font = 'Calibri',
    spaceBefore = 0,
    alignment,
    lineHeight = 200,
    paragraph = true
}: TextOptions) => {
    if (paragraph) {
        return new Paragraph({
            alignment,
            spacing: {
                before: spaceBefore,
                line: lineHeight,
            },
            children: [
                new TextRun({
                    bold,
                    size,
                    text,
                    font,
                    characterSpacing
                })
            ]
        });
    } else {
        return new TextRun({
            bold,
            size,
            text,
            font,
            characterSpacing
        })
    }
};

const getExpDetails = (exper: typeof userData.experience) => {
    let arr: any = []
    exper.forEach(exp => {
        arr.push(Text({ bold: true, text: exp.clientName + ' | ' + exp.designation, characterSpacing: 20, font: 'Calibri', size: 25, paragraph: true, spaceBefore: 300, alignment: 'left' }))
        // arr.push(new Paragraph({
        //     spacing: { before: 300 },
        //     alignment: 'left',
        //     children: [
        //         new TextRun({
        //             bold: true,
        //             text: exp.clientName,
        //             characterSpacing: 20,
        //             font: 'Calibri',
        //             size: 25
        //         }),
        //         new TextRun({
        //             size: 20,
        //             text: ' | '
        //         }),
        //         new TextRun({
        //             bold: true,
        //             text: exp.designation,
        //             characterSpacing: 20,
        //             font: 'Calibri',
        //             size: 25
        //         })
        //     ]
        // }))
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
                    Text({ alignment: 'left', text: info.name, paragraph: true, ...styles.nameFontStyle }) as Paragraph,
                    Text({ alignment: 'left', text: info.designation, paragraph: true, spaceBefore: 140, ...styles.designationFontStyle }) as Paragraph,
                    // Text({ alignment: 'left', text: info.location + ' | ' + info.phno + ' | ' + , paragraph: true, spaceBefore: 200, ...styles.designationFontStyle }) as Paragraph,
                    // new Paragraph({
                    //     alignment: 'left',
                    //     children: [
                    //         new TextRun({
                    //             text: info.name,
                    //             ...styles.nameFontStyle
                    //         }),
                    //     ]
                    // }),
                    // new Paragraph({
                    //     alignment: 'left',
                    //     spacing: {
                    //         before: 140,
                    //     },
                    //     children: [

                    //         new TextRun({
                    //             text: info.designation,
                    //             ...styles.designationFontStyle
                    //         }),
                    //     ]
                    // }),
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
                    new Table({
                        width: {
                            size: 100,
                            type: WidthType.PERCENTAGE
                        },
                        borders: styles.tableCellNoBorder,
                        rows: [
                            ...info.experience.flatMap(exp => {
                                return [
                                    new TableRow({
                                        children: [
                                            new TableCell({
                                                width: { size: 70, type: WidthType.PERCENTAGE },
                                                borders: styles.tableCellNoBorder,
                                                children: [
                                                    new Paragraph({
                                                        children: [
                                                            new TextRun({
                                                                font: 'Calibri',
                                                                text: exp.clientName,
                                                                bold: true,
                                                                characterSpacing: 10,
                                                                size: 30
                                                            }),
                                                            new TextRun({
                                                                font: 'Calibri',
                                                                text: ' | ' + exp.designation,
                                                                characterSpacing: 10,
                                                                bold: true,
                                                                size: 30,
                                                            })
                                                        ]
                                                    })
                                                ]
                                            }),
                                            new TableCell({
                                                width: { size: 30, type: WidthType.PERCENTAGE },
                                                borders: styles.tableCellNoBorder,
                                                children: [
                                                    new Paragraph({
                                                        alignment: 'right',
                                                        children: [
                                                            new TextRun({
                                                                font: 'Calibri',
                                                                text: exp.timeRange,
                                                                bold: true,
                                                                size: 20
                                                            })
                                                        ]
                                                    })
                                                ]
                                            }),
                                        ]
                                    }),
                                    new TableRow({
                                        children: [
                                            new TableCell({
                                                width: { size: 80, type: WidthType.PERCENTAGE },
                                                borders: styles.tableCellNoBorder,
                                                children: [
                                                    ...exp.points.map((pt) => {
                                                        return new Paragraph({
                                                            alignment: 'both',
                                                            spacing: {
                                                                before: 140
                                                            },
                                                            bullet: {
                                                                level: 0
                                                            },
                                                            children: [
                                                                new TextRun({
                                                                    text: pt,
                                                                    characterSpacing: 15,
                                                                    size: 12 * 2
                                                                })
                                                            ]
                                                        })
                                                    })
                                                ]
                                            }),
                                            new TableCell({
                                                borders: styles.tableCellNoBorder,
                                                width: { size: 20, type: WidthType.PERCENTAGE },
                                                children: []
                                            })

                                        ]
                                    })

                                ]
                            })
                        ]
                    }),
                    new Paragraph({ children: [new PageBreak()] }),
                    new Paragraph({
                        alignment: 'left',
                        children: [
                            new TextRun({
                                bold: true,
                                font: 'Calibri',
                                text: 'Skills',
                                size: 16 * 2
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
                        children: []
                    }),
                    new Table({
                        rows: [
                            ...info.skills.map((skill) => {
                                return new TableRow({
                                    children: [
                                        new TableCell({
                                            width: { size: 30, type: WidthType.PERCENTAGE },
                                            borders: { ...styles.tableCellNoBorder, top: { style: 'none', space: 200 } },
                                            children: [
                                                new Paragraph({
                                                    spacing: {
                                                        line: 300,
                                                    },
                                                    children: [
                                                        new TextRun({
                                                            text: skill.category + ':',
                                                            bold: true,
                                                            size: 11 * 2,
                                                            characterSpacing: 16
                                                        })
                                                    ]
                                                }),

                                            ]
                                        }),
                                        new TableCell({
                                            borders: styles.tableCellNoBorder,
                                            children: [
                                                new Paragraph({
                                                    spacing: {
                                                        line: 300,
                                                    },
                                                    children: [
                                                        new TextRun({
                                                            text: skill.technologies.join(', '),
                                                            size: 11 * 2,
                                                            characterSpacing: 16
                                                        })
                                                    ]
                                                })
                                            ]
                                        })
                                    ]
                                })
                            })
                        ]
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