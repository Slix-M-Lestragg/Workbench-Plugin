Workbench bridges the gap between your Obsidian vault and AI tools by providing deep integration with ComfyUI, intelligent model management with automatic metadata enrichment, and unified search across multiple AI model providers. Whether you're managing extensive model collections, executing complex workflows, or researching AI models from various sources, Workbench keeps everything organized, searchable, and accessible within Obsidian's familiar interface.

## Core Features
### 🔗 ComfyUI Integration
- **Real-time Connection Management**: Live status monitoring with visual indicators (Disconnected, Connecting, Ready, Busy, Error, Launching)
- **Advanced Connection Manager**: Sophisticated connection handling with automatic retry, connection healing, and state synchronization
- **Interactive Status Bar & Ribbon**: Click to reveal detailed system information including CPU/RAM/GPU stats, queue status, and connection diagnostics
- **Direct Workflow Execution**: Run ComfyUI workflows directly from JSON files with progress tracking and real-time feedback
- **Quick Launch & Access**: Copy workflows to clipboard and launch ComfyUI with a single click, or open the web interface when connected
- **Cross-Platform Support**: Launch helpers for ComfyUI Desktop (macOS) and script-based installations
- **System Monitoring**: Real-time system resource monitoring and queue management with automatic polling
- **WebSocket Integration**: Real-time bidirectional communication with ComfyUI for instant status updates
### 🎨 AI Model Management
- **Unified Model Browser**: Browse and manage your local model collection with enhanced metadata and hierarchical tree view
- **Multi-Provider Integration**: Seamless access to CivitAI and HuggingFace model repositories with intelligent provider detection
- **Hash-Based Verification**: Precise model identification using SHA256/MD5 hashing for accurate metadata matching
- **Automatic Note Generation**: Create organized model documentation with rich frontmatter, metadata, and relationships
- **Provider-Specific Metadata**: Detailed information including download counts, ratings, trained words, license info, and creator details
- **Model Relationships**: Discover compatible models, versions, and related content across providers

### 🔍 Advanced Search & Discovery
- **Unified Search Modal**: Search across CivitAI and HuggingFace simultaneously from one interface with advanced filtering
- **Provider-Specific Search**: Dedicated search capabilities with model type, base model, and sorting options
- **Intelligent Caching**: Smart caching system with configurable expiry times (7 days CivitAI, 1 hour HuggingFace by default)
- **Rate-Limited API Access**: Respectful API usage with built-in rate limiting (1s CivitAI, 0.5s HuggingFace)
- **Advanced Filtering**: Filter by model type (Checkpoint, LoRA, VAE, etc.), base model, sort options, and more

### 📁 Enhanced File Management
- **Custom JSON Viewer**: Dedicated viewer for ComfyUI workflow files with syntax highlighting and custom icons
- **Advanced File Menu Integration**: Enhanced file explorer with context-aware actions via FileMenuManager
- **Automated Model Notes**: Intelligent note creation and management with provider-specific metadata integration
- **Provider Icons**: Visual identification of model sources (CivitAI, HuggingFace, Unknown) with custom SVG icons
- **Context Menu Integration**: Enhanced file explorer with model-specific actions and workflow execution options
- **File Tree Enhancement**: Hierarchical model organization with expandable directories and metadata overlay
- **Real-time UI Updates**: Synchronized file operations with immediate UI feedback across all components

## Commands & Actions
### ComfyUI Commands
- **Launch ComfyUI App (macOS)**: Open the native ComfyUI desktop application
- **Launch ComfyUI Script**: Run your configured script or portable installation
- **Run ComfyUI Workflow from Active File**: Execute the currently open JSON workflow
- **Log ComfyUI State to Console**: Debug connection status and API state

### Model Management Commands
- **Show ComfyUI Models**: Open the model browser with enhanced metadata and provider information
- **Test CivitAI Integration**: Verify CivitAI API connection and search functionality
- **Refresh CivitAI Metadata**: Update all model metadata from CivitAI
- **Unified Model Search**: Search across all supported model providers simultaneously

### Context Menu Actions
- **Run ComfyUI Workflow**: Execute workflow directly from file explorer (JSON files)
- **Copy Workflow & Open ComfyUI**: Copy workflow to clipboard and launch ComfyUI
- **Create Model Note**: Generate documentation for model files with provider metadata

### Interactive Elements
- **Status Bar Integration**: Click status bar to view detailed connection information and system stats
- **Ribbon Icon**: Dynamic ribbon icon that changes based on ComfyUI status - click to launch or open web interface
- **Model Tree Navigation**: Expandable file tree with provider icons and metadata overlays

## Provider Integrations

### CivitAI Integration
- **Comprehensive Search**: Search the entire CivitAI model database with advanced filtering
- **Hash-Based Identification**: Automatic model identification using SHA256/MD5 file hashing
- **Version Management**: Access to all model versions, files, and download information
- **Rich Metadata**: Download counts, ratings, trained words, creator information, and licensing
- **Model Relationships**: Discover compatible models, related content, and model variants
- **API Authentication**: Optional API key support for enhanced features and higher rate limits

### HuggingFace Integration
- **Repository Access**: Browse and search HuggingFace model collections and datasets
- **File Enumeration**: View all files available in model repositories with detailed metadata
- **Pipeline Information**: Extract pipeline tags, model cards, and usage documentation
- **Advanced Search**: Search by tags, categories, model types, and pipeline attributes
- **Authentication Support**: Optional API token for private models and enhanced rate limits
- **Model Discovery**: Find related models based on tags, authors, and pipeline types

## Architecture & Technical Implementation

### Manager-Based Architecture
The plugin utilizes a sophisticated manager-based architecture for clean separation of concerns and enhanced maintainability:

- **ConfigManager**: Centralized configuration management with versioning, migrations, and device-specific settings
- **CommandManager**: Unified command registration and handling system
- **PluginLifecycleManager**: Orchestrates plugin initialization, startup sequences, and component coordination
- **ConnectionManager**: Manages ComfyUI API connections, real-time monitoring, and state synchronization
- **UIStateManager**: Handles UI state management and real-time synchronization across components
- **FileMenuManager**: Integrates context menu actions and file explorer enhancements

### Core Managers & Services

#### Configuration & Lifecycle Management
- **ConfigManager**: Advanced settings management with automatic migrations and device-specific configurations
- **PluginLifecycleManager**: Coordinated initialization of all plugin components with dependency management
- **CommandManager**: Centralized command registration with proper cleanup and lifecycle management

#### Connection & API Management
- **ConnectionManager**: Real-time ComfyUI API integration with WebSocket support and connection monitoring
- **UIStateManager**: Synchronizes UI state across all components with event-driven updates
- **FileMenuManager**: Enhanced file explorer integration with model-specific actions

#### Model & Metadata Services
- **ModelMetadataManager**: Centralized metadata enrichment and relationship discovery
- **CivitAIService**: Complete CivitAI API integration with rate limiting and intelligent caching
- **HuggingFaceService**: HuggingFace Hub integration with file listing and metadata extraction
- **HashService**: Efficient file hashing with smart sampling for large files (>100MB)

#### UI Components & Views
- **ModelListView**: Sophisticated model browser with hierarchical tree view and metadata overlay
- **UnifiedSearchModal**: Cross-provider search with advanced filtering and real-time results
- **JsonViewer**: Dedicated ComfyUI workflow viewer with syntax highlighting and custom icons

### Performance & Reliability
- **Smart Caching**: Configurable cache expiry with provider-specific defaults (7 days for CivitAI, 1 hour for HuggingFace)
- **Rate Limiting**: Respectful API usage with configurable intervals (1s for CivitAI, 0.5s for HuggingFace)
- **Error Recovery**: Automatic retry logic with exponential backoff and connection healing
- **Background Processing**: Non-blocking operations for large model collections and metadata processing
- **Memory Management**: Efficient caching with automatic cleanup and configurable memory limits
- **State Synchronization**: Real-time UI state updates across all components with event-driven architecture

### Security & Privacy
- **Secure API Key Storage**: Encrypted storage of API credentials using Obsidian's secure settings system
- **Optional Authentication**: All core features work without API keys (with appropriate rate limiting)
- **Local Processing**: Model hashing and metadata storage remain completely local to your system
- **CORS Compliance**: Proper CORS configuration guidance for ComfyUI integration
- **Data Privacy**: No telemetry or data collection - all processing happens locally

### Cross-Platform Support
- **Operating System Detection**: Automatic OS detection with platform-specific optimizations
- **Device-Specific Settings**: Independent configuration management for macOS, Windows, and Linux
- **Path Management**: Intelligent path detection and validation across different file systems
- **Launch Scripts**: Support for various ComfyUI installation methods (Desktop app, portable, script-based)
- **File System Integration**: Native file explorer integration with platform-specific context menus
- **Settings Migration**: Automatic migration of settings between plugin versions with data preservation

## Configuration

### Enhanced Configuration System
The plugin features an advanced configuration system with automatic migrations, versioning, and device-specific settings:

- **Automatic Migrations**: Settings are automatically migrated between plugin versions with data preservation
- **Version Management**: Configuration schema versioning ensures compatibility across updates
- **Device-Specific Settings**: Independent configurations for different operating systems and devices
- **Validation & Defaults**: Comprehensive setting validation with intelligent fallback values
- **Real-time Updates**: Configuration changes are immediately applied across all plugin components

### Basic Setup
1. Open Obsidian Settings → Workbench
2. **General Tab**:
   - **ComfyUI Base Directory**: Path to your main ComfyUI installation folder
   - **ComfyUI API URL**: Enter the full URL of your running ComfyUI instance (e.g., `http://localhost:8188`)
   - **Model Notes Folder**: Specify where model documentation notes should be created
3. **Launch Tab**:
   - Configure the script/batch file used to launch ComfyUI (platform-specific)
   - Set the delay before checking the connection after launch
4. **Polling Tab**:
   - **Enable Polling**: Check this box to periodically monitor ComfyUI status (Recommended)
   - Configure polling interval and retry behavior on errors

### Provider Integration
5. **CivitAI Integration**:
   - **Enable CivitAI Integration**: Toggle CivitAI model search and metadata features
   - **API Key**: Optional CivitAI API key for enhanced features (higher rate limits, access to more data)
   - **Auto Refresh Metadata**: Automatically update model metadata when detected
   - **Cache Expiry**: Configure how long CivitAI data is cached (default: 7 days)
   - **Show Ratings**: Display model ratings and statistics
   - **Show Compatible Models**: Display related and compatible models

6. **HuggingFace Integration**:
   - **Enable HuggingFace Integration**: Toggle HuggingFace model search and discovery
   - **API Token**: Optional HuggingFace API token for private models and higher rate limits
   - **Cache Expiry**: Configure cache duration for HuggingFace data (default: 7 days)
   - **Show Provider Icons**: Display visual provider indicators in the interface

### Device-Specific Settings
The plugin automatically detects your operating system and maintains separate configurations for each platform, allowing seamless usage across different devices.

## Usage Examples

- **Check Connection & Status:** Click the status bar item in Obsidian to open the status popover. This shows the current connection status, system resource usage (CPU, RAM, GPU), and the ComfyUI queue details. If disconnected, you can click the "Check" button in the popover to attempt connection.
- **Run Workflow:** Right-click on a ComfyUI workflow `.json` file in the Obsidian file explorer and select "Run ComfyUI Workflow". A notice will appear, and the status bar will update to 'Busy' while running.
- **Copy Workflow to ComfyUI:** Right-click on a workflow `.json` file and select "Copy Workflow & Open ComfyUI". Paste the workflow (Ctrl/Cmd+V) into the ComfyUI interface that opens.
- **View JSON:** Simply click on any `.json` file in the Obsidian file explorer. It will open in the custom JSON viewer, displaying the content with syntax highlighting and the custom icon in the tab header.
- **Search Models:** Use the command palette to run "Unified Model Search" to search across CivitAI and HuggingFace simultaneously with advanced filtering options.
- **Browse Local Models:** Open the "Show ComfyUI Models" command to view your local model collection with enhanced metadata and provider information.
- **Dynamic Ribbon Icon:** Click the ribbon icon to launch ComfyUI when disconnected, or open the web interface when connected. The icon changes to reflect the current status.

## Future Plans

- **Enhanced Workflow Integration**: Send images/text from Obsidian notes to ComfyUI nodes
- **Bidirectional Data Flow**: Receive generated images/data back into Obsidian notes
- **Workflow Templates**: Pre-built workflow templates and presets
- **Advanced Model Management**: Model versioning and dependency tracking
- **Extended Provider Support**: Integration with additional AI model repositories
- **Workflow Collaboration**: Share and version control workflows within Obsidian
- **Performance Analytics**: Track workflow execution times and resource usage

---

## Documentation Status

Track which source files have inline documentation/comments and which still need it:

### Core Architecture
- [x] src/core/main.ts - Main plugin class and lifecycle management ✅ 2025-06-07
- [x] src/core/ConfigManager.ts - Configuration management with versioning ✅ 2025-06-07
- [x] src/core/CommandManager.ts - Command registration and handling ✅ 2025-06-07
- [x] src/core/PluginLifecycleManager.ts - Plugin initialization coordination ✅ 2025-06-07
- [x] src/core/settings.ts - Settings interface and configuration ✅ 2025-06-07

### Services & API Integration
- [ ] src/services/ConnectionManager.ts - ComfyUI API connection management
- [ ] src/services/HashService.ts - File hashing for model identification
- [ ] src/services/providers/CivitAIService.ts - CivitAI API integration
- [ ] src/services/providers/HuggingFaceService.ts - HuggingFace API integration
- [ ] src/services/models/ModelMetadataManager.ts - Metadata enrichment and management

### UI Components & Views
- [ ] src/ui/UIStateManager.ts - UI state management and synchronization
- [ ] src/ui/FileMenuManager.ts - File explorer context menu integration
- [ ] src/ui/views/ModelListView/ModelListView.ts - Model browser interface
- [ ] src/ui/views/JsonViewer.ts - JSON workflow viewer
- [ ] src/ui/modals/UnifiedSearchModal.ts - Cross-provider search modal
- [ ] src/ui/components/status_bar.ts - Status bar implementation
- [ ] src/ui/components/StatusBarPopover.ts - Status popover component

### Legacy ComfyUI Integration (needs refactoring)
- [ ] src/comfy/launch.ts - ComfyUI launch functionality
- [ ] src/comfy/api.ts - ComfyUI API integration (superseded by ConnectionManager)
- [ ] src/comfy/polling.ts - Connection polling (integrated into ConnectionManager)
- [ ] src/comfy/generation.ts - Workflow execution

### Utilities & Types
- [ ] src/ui/utilities/icons.ts - Custom icon definitions
- [x] src/types/comfy.ts - ComfyUI type definitions ✅ 2025-06-07
- [x] src/types/ - General type definitions ✅ 2025-06-07
- [x] styles.css - Stylesheet for UI components ✅ 2025-06-07

## Contributing

This plugin is in active development. Contributions, suggestions, and feedback are welcome! Please check the GitHub repository for contribution guidelines.

## Support

If you encounter any issues or have questions, please open an issue on the GitHub repository.

---

*Workbench: Bringing your AI workflows and knowledge base together*