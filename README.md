# DocSwitch

DocSwitch is a web based document conversion application that allows users to quickly convert documents between supported file formats.

The project was developed as part of the App Development 2 final summative assessment for the Occupational Certificate: Software Engineer.

## About the Project

Document conversion is a common task for students, businesses and professionals. DocSwitch was created to provide a simple and convenient way for users to convert documents without needing to install complicated desktop software.

The application provides a simple workflow where users can upload a document, select the required output format, convert the document and download the converted file.

## Features

- Upload documents through a web interface
- Convert supported documents between different formats
- File validation
- Error handling and user feedback
- Download converted documents
- Responsive and user friendly interface
- Backend API for document processing
- LibreOffice integration for document conversion

## How It Works

The DocSwitch conversion process follows these steps:

1. The user opens the DocSwitch website.
2. The user selects a document to upload.
3. The application validates the selected file.
4. The user selects the required output format.
5. The conversion request is sent to the backend.
6. The backend processes the document using LibreOffice.
7. The converted document is returned to the application.
8. The user downloads the converted document.

## Technologies Used

### Frontend

- HTML5
- CSS3
- JavaScript

### Backend

- Python
- FastAPI
- Uvicorn

### Document Conversion

- LibreOffice

### Development Tools

- Git
- GitHub
- Visual Studio Code

## Project Structure

```text
DocSwitch/
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/
│   │   └── config.py
│   │
│   ├── requirements.txt
│   └── ...
│
├── README.md
└── LICENSE
