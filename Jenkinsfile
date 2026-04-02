pipeline {  
    agent any  

    environment {  
        DOCKER_USERNAME = "suryathejas"  
        IMAGE_NAME = "ai-fit-coach"  
        IMAGE_TAG = "latest"  

        DOCKER_PATH = "\"C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe\""  
        GIT_REPO = "https://github.com/SuryaThejas-07/Virtual_Fitness_Trainer.git"  
        BRANCH = "main"  
    }  

    stages {  

        stage('Checkout Code') {  
            steps {  
                git branch: "${BRANCH}",  
                url: "${GIT_REPO}"  
            }  
        }  

        stage('Verify Docker') {  
            steps {  
                bat '%DOCKER_PATH% --version'  
                bat '%DOCKER_PATH% info'  
            }  
        }  

        stage('Install Dependencies') {  
            steps {  
                bat 'npm ci --include=dev'  
            }  
        }  

        stage('Build App') {  
            steps {  
                bat 'npm run build'  
            }  
        }  

        stage('Build Docker Image') {  
            steps {  
                bat '''  
                %DOCKER_PATH% build -t %DOCKER_USERNAME%/%IMAGE_NAME%:%IMAGE_TAG% .  
                '''  
            }  
        }  

        stage('List Images (Debug)') {  
            steps {  
                bat '%DOCKER_PATH% images'  
            }  
        }  

        stage('Login to DockerHub') {  
            steps {  
                withCredentials([usernamePassword(  
                    credentialsId: 'docker-credentials',  
                    usernameVariable: 'DOCKER_USER',  
                    passwordVariable: 'DOCKER_PASS'  
                )]) {  
                    bat '''  
                    %DOCKER_PATH% logout  
                    echo %DOCKER_PASS% | %DOCKER_PATH% login -u %DOCKER_USER% --password-stdin  
                    '''  
                }  
            }  
        }  

        stage('Push Image') {  
            steps {  
                retry(3) {  
                    bat '''  
                    %DOCKER_PATH% push %DOCKER_USERNAME%/%IMAGE_NAME%:%IMAGE_TAG%  
                    '''  
                }  
            }  
        }  
    }  

    post {  
        success {  
            echo '✅ ai-fit-coach image built and pushed successfully!'  
        }  
        failure {  
            echo '❌ Pipeline failed. Check Docker login / credentials.'  
        }  
    }  
}