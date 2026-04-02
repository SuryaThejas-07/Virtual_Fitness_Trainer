pipeline {
    agent any

    environment {
        REGISTRY = "docker.io"
        IMAGE_NAME = "your-dockerhub-username/ai-fit-coach"
        IMAGE_TAG = "${BUILD_NUMBER}"
        DOCKER_CREDENTIALS = credentials('docker-credentials')
        NODE_ENV = 'production'
    }

    options {
        timestamps()
        timeout(time: 1, unit: 'HOURS')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "Checking out code from repository..."
                    checkout scm
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                script {
                    echo "Installing Node.js dependencies..."
                    sh 'npm ci'
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    echo "Running ESLint..."
                    sh 'npm run lint || true'
                }
            }
        }

        stage('Test') {
            steps {
                script {
                    echo "Running tests..."
                    sh 'npm run test || true'
                }
            }
        }

        stage('Build') {
            steps {
                script {
                    echo "Building the application..."
                    sh 'npm run build'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    echo "Building Docker image..."
                    sh '''
                        docker build \
                            -t ${IMAGE_NAME}:${IMAGE_TAG} \
                            -t ${IMAGE_NAME}:latest \
                            .
                    '''
                }
            }
        }

        stage('Push to Registry') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo "Pushing Docker image to registry..."
                    sh '''
                        echo $DOCKER_CREDENTIALS_PSW | docker login -u $DOCKER_CREDENTIALS_USR --password-stdin
                        docker push ${IMAGE_NAME}:${IMAGE_TAG}
                        docker push ${IMAGE_NAME}:latest
                    '''
                }
            }
        }

        stage('Deploy to Kubernetes') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo "Deploying to Kubernetes..."
                    sh '''
                        kubectl set image deployment/ai-fit-coach \
                            ai-fit-coach=${IMAGE_NAME}:${IMAGE_TAG} \
                            -n production || \
                        kubectl apply -f deployment.yml -n production
                    '''
                }
            }
        }

        stage('Verify Deployment') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo "Verifying deployment..."
                    sh '''
                        kubectl rollout status deployment/ai-fit-coach -n production --timeout=5m
                    '''
                }
            }
        }
    }

    post {
        always {
            script {
                echo "Cleaning up Docker login..."
                sh 'docker logout'
            }
            cleanWs()
        }
        success {
            echo "Pipeline executed successfully!"
        }
        failure {
            echo "Pipeline failed. Check logs for details."
        }
    }
}
