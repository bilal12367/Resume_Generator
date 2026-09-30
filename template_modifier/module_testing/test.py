import asyncio, json

async def main():
    from pdf_generator import PDFGenerator


    gen = PDFGenerator()


    json_path = '../user_data/bilal_resume_data_ai.json'
    data = open(json_path, 'r').read()

    await gen.generate_pdfs_for_all_templates(
        data=json.loads(data),
        filename='test'
    )
    

asyncio.run(main())